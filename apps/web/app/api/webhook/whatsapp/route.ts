import { NextRequest, NextResponse } from 'next/server';
import { analyzeMessage } from '@/lib/gemini';
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

    // Store message in database
    await MessageService.storeMessage(messageSid, from, body, referredMessageSid);

    // Process message
    let responseMessage = 'Hi';
    
    if (body && body.trim()) {
      try {
        const userNumber = from;
        const messageBody = body.trim().toLowerCase();

        // If message is forwarded, treat it as an order creation request
        if (isForwarded) {
          const analysis = await analyzeMessage(body);
          // Force entity type to order for forwarded messages
          if (analysis.intent === 'create' || analysis.intent === 'unknown') {
            const orderAnalysis = {
              intent: 'create',
              entityType: 'order',
              parameters: analysis.parameters || {}
            };
            responseMessage = await handleCreate(userNumber, orderAnalysis, body);
            return createTwiMLResponse(responseMessage);
          }
        }

        // Try to handle as reply first
        if (referredMessageSid) {
          const context = await loadMessageContext(userNumber, referredMessageSid);
          if (context) {
            const replyResponse = await handleReply(userNumber, body, referredMessageSid, context);
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

        // Analyze message and handle intent
        const analysis = await analyzeMessage(body);
        const handler = INTENT_HANDLERS[analysis.intent];
        if (handler) {
          responseMessage = await handler(userNumber, analysis, body);
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
