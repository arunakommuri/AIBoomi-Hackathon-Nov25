import { NextRequest, NextResponse } from 'next/server';
import { analyzeMessage, type MessageAnalysis, detectLanguage, translateTextWithGemini } from '@/lib/gemini';
import {
  handleCreate,
  handleGet,
  handleUpdate,
  handleReply,
  handlePagination,
  handleConfirmation,
  loadMessageContext,
} from '@/lib/actions';
import { MessageService } from '@/lib/services/message-service';
import { getFirstAudioMedia, getFirstImageMedia, downloadTwilioMedia } from '@/lib/media-handler';
import { transcribeAudio } from '@/lib/stt';
import { analyzeImage } from '@/lib/gemini';

// Helper function to create TwiML XML response
function createTwiMLResponse(message: string): NextResponse {
  const escapedMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>${escapedMessage}</Message>
      </Response>`;
  
  return new NextResponse(xmlResponse, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
}

// Intent handler map
const INTENT_HANDLERS: Record<string, (userNumber: string, analysis: any, body?: string) => Promise<string>> = {
  'create': handleCreate,
  'get': handleGet,
  'update': handleUpdate,
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const from = formData.get('From') as string | null;
    const body = formData.get('Body') as string | null;
    const messageSid = formData.get('MessageSid') as string | null;
    const forwarded = formData.get('Forwarded') as string | null;
    const isForwarded = forwarded === 'true';
    
    // Check for reply reference - Twilio WhatsApp uses OriginalRepliedMessageSid
    let referredMessageSid: string | null = null;
    const possibleFieldNames = [
      'OriginalRepliedMessageSid',
      'ReferredMessageSid',
      'ReferencedMessageSid', 
      'ReferredMessageId',
      'ReferencedMessageId',
      'ReferredMessage',
      'ReferencedMessage',
      'ReferredMessageSid0',
      'ReferencedMessageSid0'
    ];
    
    for (const fieldName of possibleFieldNames) {
      const value = formData.get(fieldName) as string | null;
      if (value && value.trim() !== '') {
        referredMessageSid = value;
        break;
      }
    }

    // Validate required fields
    if (!from || !messageSid) {
      console.error('Missing required fields:', { from, messageSid });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Initialize database schema (only creates tables if they don't exist)
    await MessageService.initializeDatabase();

    // Check for media (audio/image)
    const audioMedia = getFirstAudioMedia(formData);
    const imageMedia = getFirstImageMedia(formData);
    let processedBody = body;
    let imageAnalysisResult: MessageAnalysis | null = null; // Store image analysis for direct use
    let mediaInfo: {
      url: string | null;
      type: string | null;
      contentType: string | null;
      extractedText: string | null;
      originalBody: string | null;
      mediaData: Buffer | null;
    } = {
      url: null,
      type: null,
      contentType: null,
      extractedText: null,
      originalBody: body || null,
      mediaData: null,
    };

    // If audio media is present, transcribe it
    if (audioMedia) {
      try {
        console.log('Processing audio media:', audioMedia);
        mediaInfo.url = audioMedia.url;
        mediaInfo.type = 'audio';
        mediaInfo.contentType = audioMedia.contentType;
        
        // Download audio from Twilio
        const audioBuffer = await downloadTwilioMedia(audioMedia.url);
        console.log('Downloaded audio, size:', audioBuffer.length, 'bytes');
        
        // Store the media file data
        mediaInfo.mediaData = audioBuffer;
        
        // Transcribe audio using Sarvam.ai STT
        const transcribedText = await transcribeAudio(audioBuffer);
        console.log('Transcribed text:', transcribedText);
        
        // Store extracted text and use as processed body
        mediaInfo.extractedText = transcribedText;
        processedBody = transcribedText;
      } catch (error) {
        console.error('Error processing audio media:', error);
        // If transcription fails, inform user and continue with original body (if any)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createTwiMLResponse(
          `I received your voice note, but I'm having trouble processing it. ${errorMessage}. Please try sending a text message instead.`
        );
      }
    } else if (imageMedia) {
      // If image media is present, analyze it with Gemini Vision
      try {
        console.log('Processing image media:', imageMedia);
        mediaInfo.url = imageMedia.url;
        mediaInfo.type = 'image';
        mediaInfo.contentType = imageMedia.contentType;
        
        // Download image from Twilio
        const imageBuffer = await downloadTwilioMedia(imageMedia.url);
        console.log('Downloaded image, size:', imageBuffer.length, 'bytes');
        
        // Store the media file data
        mediaInfo.mediaData = imageBuffer;
        
        // Analyze image using Gemini Vision API
        const imageAnalysis = await analyzeImage(imageBuffer, imageMedia.contentType);
        console.log('Image analysis result:', imageAnalysis);
        
        // Store extracted text and structured analysis
        mediaInfo.extractedText = imageAnalysis.extractedText;
        processedBody = imageAnalysis.extractedText;
        imageAnalysisResult = imageAnalysis.analysis; // Store for direct use
      } catch (error) {
        console.error('Error processing image media:', error);
        // If image analysis fails, inform user
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createTwiMLResponse(
          `I received your image, but I'm having trouble processing it. ${errorMessage}. Please try sending a text message or describe what's in the image.`
        );
      }
    } else {
      // No media - this is a text message
      mediaInfo.type = 'text';
      mediaInfo.originalBody = body || null;
    }

    // Detect language first to avoid unnecessary translation calls
    // Only translate if message is mixed-language or non-English
    const originalBody = processedBody || body;
    let translatedBody = originalBody;
    
    if (translatedBody && translatedBody.trim()) {
      try {
        // Use Gemini to detect language type
        const languageDetection = await detectLanguage(translatedBody);
        console.log('Language detection result:', languageDetection);
        
        // Only translate if needed (mixed language or non-English)
        if (languageDetection.needsTranslation) {
          try {
            // Use Gemini for translation instead of Sarvam API
            translatedBody = await translateTextWithGemini(translatedBody);
            if (translatedBody !== originalBody) {
              console.log('Translated message with Gemini:', { 
                original: originalBody, 
                translated: translatedBody,
                detectedLanguages: languageDetection.detectedLanguages 
              });
            }
          } catch (translationError) {
            console.error('Error translating message with Gemini (using original):', translationError);
            // Continue with original text if translation fails
          }
        } else {
          console.log('Message is English-only, skipping translation');
        }
      } catch (error) {
        console.error('Error detecting language (using original):', error);
        // Continue with original text if language detection fails
      }
    }

    // Store message in database with all media information
    // Store original body, but use translated body for processing
    await MessageService.storeMessage(
      messageSid,
      from,
      translatedBody || body,
      referredMessageSid,
      mediaInfo
    );

    // Process message
    let responseMessage = 'Hi';
    
    if (translatedBody && translatedBody.trim()) {
      try {
        const userNumber = from;
        const messageBody = translatedBody.trim().toLowerCase();

        // If message is forwarded, treat it as an order creation request
        if (isForwarded) {
          const analysis = await analyzeMessage(translatedBody, originalBody || undefined);
          // Force entity type to order for forwarded messages
          if (analysis.intent === 'create' || analysis.intent === 'unknown') {
            const orderAnalysis = {
              intent: 'create',
              entityType: 'order',
              parameters: analysis.parameters || {}
            };
            responseMessage = await handleCreate(userNumber, orderAnalysis, originalBody || undefined);
            return createTwiMLResponse(responseMessage);
          }
        }

        // Try to handle as reply first
        if (referredMessageSid) {
          const context = await loadMessageContext(userNumber, referredMessageSid);
          if (context) {
            const replyResponse = await handleReply(userNumber, translatedBody, referredMessageSid, context);
            if (replyResponse) {
              return createTwiMLResponse(replyResponse);
            }
          }
        }

        // Try pagination
        const paginationResponse = await handlePagination(userNumber, messageBody);
        if (paginationResponse) {
          return createTwiMLResponse(paginationResponse);
        }

        // Try confirmation
        const confirmationResponse = await handleConfirmation(userNumber, messageBody);
        if (confirmationResponse) {
          return createTwiMLResponse(confirmationResponse);
        }

        // Use image analysis if available, otherwise analyze the text
        let analysis: MessageAnalysis;
        if (imageAnalysisResult) {
          // Use the structured analysis from image
          analysis = imageAnalysisResult;
          console.log('Using image analysis directly:', analysis);
        } else {
          // Analyze text message - pass both translated (for intent) and original (for product names)
          analysis = await analyzeMessage(translatedBody, originalBody || undefined);
        }
        
        const handler = INTENT_HANDLERS[analysis.intent];
        if (handler) {
          // Pass original body to handlers so they can preserve original product names
          responseMessage = await handler(userNumber, analysis, originalBody || undefined);
        } else {
          responseMessage = getUnknownIntentMessage();
        }
      } catch (error) {
        console.error('Error analyzing message:', error);
        responseMessage = "I'm having trouble understanding. Could you please rephrase that?";
      }
    }

    // Return TwiML response (Twilio will automatically send this message)
    return createTwiMLResponse(responseMessage);
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


function getUnknownIntentMessage(): string {
  return "I can help you with tasks and orders. You can:\n" +
    "• Create: 'Create a task to buy groceries tomorrow'\n" +
    "• View: 'Show my tasks' or 'List my orders'\n" +
    "• Update: 'Mark task 1 as completed' or 'Update order #123 to processing'\n\n" +
    "What would you like to do?";
}


// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'ok', message: 'WhatsApp webhook endpoint is active' });
}
