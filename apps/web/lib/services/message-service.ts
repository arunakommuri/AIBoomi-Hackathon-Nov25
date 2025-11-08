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
        END $$;`
      );
    } catch (messageError) {
      console.error('Error creating messages table:', messageError);
    }
  }

  /**
   * Store incoming message in database
   */
  static async storeMessage(
    messageSid: string,
    from: string,
    body: string | null,
    referredMessageSid: string | null
  ): Promise<void> {
    try {
      await query(
        'INSERT INTO messages (message_sid, from_number, body, referred_message_sid) VALUES ($1, $2, $3, $4) ON CONFLICT (message_sid) DO NOTHING',
        [messageSid, from, body || '', referredMessageSid || null]
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
}

