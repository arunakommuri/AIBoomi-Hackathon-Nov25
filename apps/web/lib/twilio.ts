import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error('Twilio credentials are not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
}

export const twilioClient = twilio(accountSid, authToken);

export async function sendWhatsAppMessage(to: string, message: string) {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  
  if (!from) {
    throw new Error('TWILIO_WHATSAPP_FROM is not configured');
  }

  return twilioClient.messages.create({
    from: from,
    to: to,
    body: message,
  });
}

