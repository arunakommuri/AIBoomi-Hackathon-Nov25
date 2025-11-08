import twilio from 'twilio';

/**
 * Twilio Configuration
 * 
 * These credentials are loaded from .env.local file by Next.js automatically.
 * Next.js loads environment variables in this order (highest priority first):
 * 1. .env.local (loaded in all environments, highest priority)
 * 2. .env.development / .env.production (environment-specific)
 * 3. .env (default values)
 * 
 * Make sure to set these in apps/web/.env.local:
 * - TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * - TWILIO_AUTH_TOKEN=your_actual_auth_token
 * - TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
 */
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

// Initialize Twilio client only if credentials are available
let twilioClient: twilio.Twilio | null = null;

if (accountSid && authToken) {
  // Check if credentials are still placeholders
  if (accountSid.includes('your_twilio') || authToken.includes('your_twilio')) {
    console.warn('⚠️  Twilio credentials appear to be placeholders. Please update .env.local with actual credentials.');
  } else {
    try {
      twilioClient = twilio(accountSid, authToken);
      console.log('✅ Twilio client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Twilio client:', error);
    }
  }
} else {
  console.warn('⚠️  Twilio credentials not found in environment variables');
}

/**
 * Initialize or re-initialize Twilio client if credentials are available
 * This allows the client to be initialized even if credentials were added after module load
 */
function initializeTwilioClient(): twilio.Twilio | null {
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
    return null;
  }

  // Check if credentials are still placeholders
  if (accountSid.includes('your_twilio') || authToken.includes('your_twilio')) {
    return null;
  }

  try {
    return twilio(accountSid, authToken);
  } catch (error) {
    console.error('❌ Failed to initialize Twilio client:', error);
    return null;
  }
}

export async function sendWhatsAppMessage(to: string, message: string) {
  // Try to initialize client if not already initialized (in case credentials were added after module load)
  if (!twilioClient) {
    twilioClient = initializeTwilioClient();
  }

  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in apps/web/.env.local file and restart the server.');
    }
    
    if (accountSid.includes('your_twilio') || authToken.includes('your_twilio')) {
      throw new Error('Twilio credentials are still set to placeholder values. Please update apps/web/.env.local with your actual Twilio Account SID and Auth Token from https://console.twilio.com/');
    }
    
    throw new Error('Twilio client not initialized. Please check your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in apps/web/.env.local and restart the server.');
  }

  const from = process.env.TWILIO_WHATSAPP_FROM;
  
  if (!from) {
    throw new Error('TWILIO_WHATSAPP_FROM is not configured. Please set it in apps/web/.env.local (format: whatsapp:+14155238886)');
  }

  if (from.includes('your_') || from.includes('whatsapp:+14155238886')) {
    console.warn('⚠️  TWILIO_WHATSAPP_FROM may be a placeholder. Please update with your actual Twilio WhatsApp number.');
  }

  try {
    console.log(`📤 Sending WhatsApp message to ${to} from ${from}`);
    const result = await twilioClient.messages.create({
    from: from,
    to: to,
    body: message,
  });
    console.log(`✅ Message sent successfully. SID: ${result.sid}`);
    return result;
  } catch (error: any) {
    console.error(`❌ Failed to send WhatsApp message:`, error.message);
    if (error.code === 21211) {
      throw new Error(`Invalid recipient number format: ${to}. Ensure it's in format: whatsapp:+1234567890`);
    }
    if (error.code === 21608) {
      throw new Error(`Invalid sender number: ${from}. Ensure your Twilio WhatsApp number is correct and approved.`);
    }
    throw error;
  }
}

