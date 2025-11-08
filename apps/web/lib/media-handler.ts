import { twilioClient } from './twilio';

export interface MediaInfo {
  url: string;
  contentType: string;
  sid: string;
}

/**
 * Extract media information from Twilio webhook form data
 * 
 * @param formData - FormData from Twilio webhook request
 * @returns Array of media information (audio/images)
 */
export function extractMediaFromTwilio(formData: FormData): MediaInfo[] {
  const numMedia = parseInt(formData.get('NumMedia') as string || '0');
  const media: MediaInfo[] = [];

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = formData.get(`MediaUrl${i}`) as string | null;
    const mediaContentType = formData.get(`MediaContentType${i}`) as string | null;
    const mediaSid = formData.get(`MediaSid${i}`) as string | null;

    if (mediaUrl && mediaContentType) {
      media.push({
        url: mediaUrl,
        contentType: mediaContentType,
        sid: mediaSid || '',
      });
    }
  }

  return media;
}

/**
 * Check if media is an audio file
 */
export function isAudioMedia(media: MediaInfo): boolean {
  const audioTypes = [
    'audio/ogg',
    'audio/opus',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/aac',
    'audio/mp4',
    'audio/webm',
    'audio/amr',
    'audio/x-m4a',
  ];
  
  return audioTypes.some(type => media.contentType.toLowerCase().includes(type));
}

/**
 * Check if media is an image file
 */
export function isImageMedia(media: MediaInfo): boolean {
  const imageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  
  return imageTypes.some(type => media.contentType.toLowerCase().includes(type));
}

/**
 * Download media file from Twilio URL
 * Twilio media URLs require authentication using Twilio credentials
 * 
 * @param mediaUrl - Twilio media URL
 * @returns Buffer containing the media file
 */
export async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  try {
    // Twilio media URLs require authentication
    // The URL format is: https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages/{MessageSid}/Media/{MediaSid}
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }
    
    // Create basic auth header
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    // Twilio media URLs can be accessed directly with Basic Auth
    // The URL from the webhook is already the correct URL to download the media
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to download media: ${response.status} ${response.statusText}. ${errorText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error downloading Twilio media:', error.message);
      throw new Error(`Failed to download media from Twilio: ${error.message}`);
    }
    throw new Error('Unknown error occurred while downloading media');
  }
}

/**
 * Get the first audio media from Twilio webhook
 */
export function getFirstAudioMedia(formData: FormData): MediaInfo | null {
  const media = extractMediaFromTwilio(formData);
  return media.find(m => isAudioMedia(m)) || null;
}

/**
 * Get the first image media from Twilio webhook
 */
export function getFirstImageMedia(formData: FormData): MediaInfo | null {
  const media = extractMediaFromTwilio(formData);
  return media.find(m => isImageMedia(m)) || null;
}

