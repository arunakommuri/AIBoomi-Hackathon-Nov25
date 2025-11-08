import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const from = formData.get('From') as string | null;
    const body = formData.get('Body') as string | null;
    const messageSid = formData.get('MessageSid') as string | null;

    // Validate required fields
    if (!from || !messageSid) {
      console.error('Missing required fields:', { from, messageSid });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Log the incoming message
    console.log('Received WhatsApp message:', { from, body, messageSid });

    // Store message in database (optional for now, but good practice)
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          message_sid VARCHAR(255) UNIQUE,
          from_number VARCHAR(255),
          body TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );

      await query(
        'INSERT INTO messages (message_sid, from_number, body) VALUES ($1, $2, $3) ON CONFLICT (message_sid) DO NOTHING',
        [messageSid, from, body || '']
      );
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue even if DB fails
    }

    // Simple response: just send "Hi" back
    const responseMessage = 'Hi';

    // Escape XML special characters in the message
    const escapedMessage = responseMessage
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

    // Return TwiML response (Twilio will automatically send this message)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>${escapedMessage}</Message>
      </Response>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      }
    );
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'ok', message: 'WhatsApp webhook endpoint is active' });
}

