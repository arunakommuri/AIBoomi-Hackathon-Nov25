import { query, initializeSchema } from '@/lib/db';

export class MessageService {
  private static schemaInitialized = false;

  /**
   * Initialize database schema and tables (only runs once per process)
   */
  static async initializeDatabase(): Promise<void> {
    // Skip if already initialized in this process
    if (this.schemaInitialized) {
      return;
    }

    try {
      await initializeSchema();
      this.schemaInitialized = true;
    } catch (schemaError) {
      console.error('Schema initialization error:', schemaError);
      // Don't set flag on error, so it can retry
    }

    // Create user message context table
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS user_message_context (
          id SERIAL PRIMARY KEY,
          user_number VARCHAR(255) NOT NULL,
          entity_type VARCHAR(50),
          order_ids TEXT[],
          task_ids INTEGER[],
          order_mappings JSONB,
          task_mappings JSONB,
          context_data JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_number)
        )`
      );
      
      await query(
        `DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_message_context' AND column_name = 'order_mappings'
          ) THEN
            ALTER TABLE user_message_context ADD COLUMN order_mappings JSONB;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_message_context' AND column_name = 'task_mappings'
          ) THEN
            ALTER TABLE user_message_context ADD COLUMN task_mappings JSONB;
          END IF;
        END $$;`
      );
    } catch (contextError) {
      console.error('Error creating user_message_context table:', contextError);
    }

    // Create messages table
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          message_sid VARCHAR(255) UNIQUE,
          from_number VARCHAR(255),
          body TEXT,
          referred_message_sid VARCHAR(255),
          context JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
      );

      await query(
        `DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'referred_message_sid'
          ) THEN
            ALTER TABLE messages ADD COLUMN referred_message_sid VARCHAR(255);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'context'
          ) THEN
            ALTER TABLE messages ADD COLUMN context JSONB;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'media_url'
          ) THEN
            ALTER TABLE messages ADD COLUMN media_url TEXT;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'media_type'
          ) THEN
            ALTER TABLE messages ADD COLUMN media_type VARCHAR(50);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'media_content_type'
          ) THEN
            ALTER TABLE messages ADD COLUMN media_content_type VARCHAR(100);
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'extracted_text'
          ) THEN
            ALTER TABLE messages ADD COLUMN extracted_text TEXT;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'original_body'
          ) THEN
            ALTER TABLE messages ADD COLUMN original_body TEXT;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'messages' AND column_name = 'media_data'
          ) THEN
            ALTER TABLE messages ADD COLUMN media_data BYTEA;
          END IF;
        END $$;`
      );
    } catch (messageError) {
      console.error('Error creating messages table:', messageError);
    }
  }

  /**
   * Store incoming message in database with media information
   */
  static async storeMessage(
    messageSid: string,
    from: string,
    body: string | null,
    referredMessageSid: string | null,
    mediaInfo?: {
      url: string | null;
      type: string | null; // 'audio', 'image', 'text'
      contentType: string | null;
      extractedText: string | null; // Transcribed text from audio or extracted text from image
      originalBody: string | null; // Original text body if any
      mediaData?: Buffer | null; // Optional: store media file as binary
    }
  ): Promise<void> {
    try {
      const mediaUrl = mediaInfo?.url || null;
      const mediaType = mediaInfo?.type || null;
      const mediaContentType = mediaInfo?.contentType || null;
      const extractedText = mediaInfo?.extractedText || null;
      const originalBody = mediaInfo?.originalBody || null;
      const mediaData = mediaInfo?.mediaData || null;

      // The body should be the processed text (transcribed or extracted)
      // If extractedText exists, use it; otherwise use body
      const processedBody = extractedText || body || '';

      await query(
        `INSERT INTO messages (
          message_sid, 
          from_number, 
          body, 
          referred_message_sid, 
          media_url, 
          media_type, 
          media_content_type, 
          extracted_text, 
          original_body,
          media_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
        ON CONFLICT (message_sid) DO UPDATE SET
          body = EXCLUDED.body,
          extracted_text = EXCLUDED.extracted_text,
          original_body = EXCLUDED.original_body,
          media_url = EXCLUDED.media_url,
          media_type = EXCLUDED.media_type,
          media_content_type = EXCLUDED.media_content_type,
          media_data = EXCLUDED.media_data`,
        [
          messageSid,
          from,
          processedBody,
          referredMessageSid || null,
          mediaUrl,
          mediaType,
          mediaContentType,
          extractedText,
          originalBody,
          mediaData,
        ]
      );
    } catch (dbError) {
      console.error('Database error storing message:', dbError);
      // Don't throw - allow processing to continue even if message storage fails
    }
  }

  /**
   * Get message by message SID
   */
  static async getMessageBySid(messageSid: string, fromNumber: string): Promise<any | null> {
    try {
      const result = await query(
        'SELECT * FROM messages WHERE message_sid = $1 AND from_number = $2',
        [messageSid, fromNumber]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Error getting message by SID:', error);
      return null;
    }
  }

  /**
   * Get messages with media information for a user
   */
  static async getMessagesWithMedia(
    fromNumber: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const result = await query(
        `SELECT 
          id,
          message_sid,
          from_number,
          body,
          extracted_text,
          original_body,
          media_url,
          media_type,
          media_content_type,
          created_at,
          CASE 
            WHEN media_data IS NOT NULL THEN true 
            ELSE false 
          END as has_media_data
        FROM messages 
        WHERE from_number = $1 
        ORDER BY created_at DESC 
        LIMIT $2`,
        [fromNumber, limit]
      );
      return result.rows;
    } catch (error) {
      console.error('Error getting messages with media:', error);
      return [];
    }
  }

  /**
   * Get media data for a specific message
   */
  static async getMediaData(messageSid: string): Promise<Buffer | null> {
    try {
      const result = await query(
        'SELECT media_data FROM messages WHERE message_sid = $1',
        [messageSid]
      );
      if (result.rows.length > 0 && result.rows[0].media_data) {
        return result.rows[0].media_data;
      }
      return null;
    } catch (error) {
      console.error('Error getting media data:', error);
      return null;
    }
  }
}

