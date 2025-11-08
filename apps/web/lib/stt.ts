import FormDataNode from 'form-data';
import axios from 'axios';
import fs from 'fs';
import { Readable } from 'stream';

const API_BASE_URL = 'https://api.sarvam.ai';
const STT_ENDPOINT = `${API_BASE_URL}/speech-to-text`;

export interface SarvamSTTResponse {
  transcript: string;
  language_code?: string;
  model?: string;
  [key: string]: any;
}

export interface SarvamSTTOptions {
  model?: string;
  language_code?: string;
}

/**
 * Transcribe audio file using Sarvam.ai Speech-to-Text API
 * 
 * @param audioFile - Path to audio file, Buffer, or Readable stream
 * @param options - Optional parameters (model, language_code)
 * @returns Transcribed text
 * 
 * @throws Error if API key is not configured or transcription fails
 * 
 * Reference: https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe
 */
export async function transcribeAudio(
  audioFile: string | Buffer | Readable,
  options: SarvamSTTOptions = {}
): Promise<string> {
  const apiKey = process.env.SARVAM_AI_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      'SARVAM_AI_API_KEY is not configured. Please set it in your environment variables.'
    );
  }

  const model = options.model || process.env.SARVAM_AI_MODEL || 'saarika:v2.5';
  const languageCode = options.language_code || 'unknown'; // 'unknown' enables auto-detection

  try {
    // Convert input to Buffer if needed
    let audioBuffer: Buffer;
    
    if (typeof audioFile === 'string') {
      // File path
      if (!fs.existsSync(audioFile)) {
        throw new Error(`Audio file not found: ${audioFile}`);
      }
      audioBuffer = fs.readFileSync(audioFile);
    } else if (Buffer.isBuffer(audioFile)) {
      // Already a buffer
      audioBuffer = audioFile;
    } else if (audioFile instanceof Readable) {
      // Readable stream - convert to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of audioFile) {
        chunks.push(Buffer.from(chunk));
      }
      audioBuffer = Buffer.concat(chunks);
    } else {
      throw new Error('Invalid audio file input type');
    }
    
    // Create FormData using form-data package
    const formData = new FormDataNode();
    
    // Append file as buffer with proper options
    formData.append('file', audioBuffer, {
      filename: 'audio.ogg',
      contentType: 'audio/ogg',
    });
    
    // Add optional parameters
    formData.append('model', model);
    formData.append('language_code', languageCode);

    // Use axios which handles form-data better than fetch
    try {
      const response = await axios.post(STT_ENDPOINT, formData, {
        headers: {
          'api-subscription-key': apiKey,
          ...formData.getHeaders(),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      const result: SarvamSTTResponse = response.data;
      
      if (!result.transcript) {
        throw new Error('No transcript found in API response');
      }

      return result.transcript;
    } catch (axiosError: any) {
      if (axios.isAxiosError(axiosError)) {
        const status = axiosError.response?.status;
        const statusText = axiosError.response?.statusText;
        const errorBody = axiosError.response?.data;
        
        console.error('Sarvam.ai STT API error:', {
          status,
          statusText,
          body: errorBody,
        });
        
        throw new Error(
          `Sarvam.ai STT API error: ${status} ${statusText}. ${JSON.stringify(errorBody)}`
        );
      }
      throw axiosError;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error transcribing audio with Sarvam.ai:', error.message);
      throw error;
    }
    throw new Error('Unknown error occurred during audio transcription');
  }
}

/**
 * Transcribe audio from a URL (downloads first, then transcribes)
 * Useful for Twilio media URLs
 * 
 * @param audioUrl - URL to download audio file from
 * @param options - Optional parameters (model, language_code)
 * @returns Transcribed text
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  options: SarvamSTTOptions = {}
): Promise<string> {
  try {
    // Download audio file from URL
    const response = await fetch(audioUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download audio from URL: ${response.status} ${response.statusText}`);
    }

    // Get audio as buffer
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // Transcribe the buffer
    return await transcribeAudio(audioBuffer, options);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error transcribing audio from URL:', error.message);
      throw new Error(`Failed to transcribe audio from URL: ${error.message}`);
    }
    throw new Error('Unknown error occurred during URL audio transcription');
  }
}

/**
 * Check if audio file duration is suitable for real-time API
 * Real-time API is recommended for files under 30 seconds
 * 
 * Note: This is a helper function. Actual duration check may require
 * audio file parsing. For now, we'll use real-time API by default.
 * 
 * @param audioFile - Path to audio file, Buffer, or Readable stream
 * @returns true if should use real-time API (default behavior)
 */
export function shouldUseRealTimeAPI(audioFile: string | Buffer | Readable): boolean {
  // For now, always use real-time API
  // In production, you might want to check file size or duration
  // and use batch API for larger files
  return true;
}

