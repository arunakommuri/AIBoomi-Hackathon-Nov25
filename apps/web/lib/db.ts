import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5433'),
      database: process.env.DB_NAME || 'weavers',
      user: process.env.DB_USER || 'aibhoomi',
      password: process.env.DB_PASSWORD || 'aiBhoomiHack81125',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      pool = null; // Reset pool on error
    });
  }
  return pool;
}

export async function query(text: string, params?: any[]): Promise<any> {
  let client: PoolClient | null = null;
  try {
    const pool = getDbPool();
    client = await pool.connect();
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Initialize database schema
export async function initializeSchema(): Promise<void> {
  try {
    // Create tasks table
    await query(
      `CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        due_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        original_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Add original_message column if it doesn't exist (for existing databases)
    await query(
      `DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'tasks' AND column_name = 'original_message'
        ) THEN
          ALTER TABLE tasks ADD COLUMN original_message TEXT;
        END IF;
      END $$;`
    );

    // Create orders table
    await query(
      `CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(255) NOT NULL,
        order_id VARCHAR(255) UNIQUE,
        product_name VARCHAR(500) NOT NULL,
        quantity INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'pending',
        fulfillment_date TIMESTAMP,
        original_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Add fulfillment_date column if it doesn't exist (for existing databases)
    await query(
      `DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'orders' AND column_name = 'fulfillment_date'
        ) THEN
          ALTER TABLE orders ADD COLUMN fulfillment_date TIMESTAMP;
        END IF;
      END $$;`
    );

    // Add original_message column if it doesn't exist (for existing databases)
    await query(
      `DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'orders' AND column_name = 'original_message'
        ) THEN
          ALTER TABLE orders ADD COLUMN original_message TEXT;
        END IF;
      END $$;`
    );

    // Create pending_confirmations table for task and order update confirmations
    await query(
      `CREATE TABLE IF NOT EXISTS pending_confirmations (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(255) NOT NULL,
        task_id INTEGER,
        order_id VARCHAR(255),
        updates JSONB NOT NULL,
        original_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
        UNIQUE(user_number)
      )`
    );

    // Add order_id column if it doesn't exist (for existing databases)
    await query(
      `DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pending_confirmations' AND column_name = 'order_id'
        ) THEN
          ALTER TABLE pending_confirmations ADD COLUMN order_id VARCHAR(255);
        END IF;
        -- Make task_id nullable if it's currently NOT NULL
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'pending_confirmations' 
          AND column_name = 'task_id' 
          AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE pending_confirmations ALTER COLUMN task_id DROP NOT NULL;
        END IF;
        -- Add unique constraint on user_number if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'pending_confirmations' 
          AND constraint_name = 'pending_confirmations_user_number_key'
        ) THEN
          ALTER TABLE pending_confirmations ADD CONSTRAINT pending_confirmations_user_number_key UNIQUE (user_number);
        END IF;
      END $$;`
    );

    // Create pagination_state table for tracking list pagination
    await query(
      `CREATE TABLE IF NOT EXISTS pagination_state (
        id SERIAL PRIMARY KEY,
        user_number VARCHAR(255) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        offset_count INTEGER DEFAULT 0,
        total_count INTEGER,
        filters JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
        UNIQUE(user_number, entity_type)
      )`
    );

    await query(
      `CREATE INDEX IF NOT EXISTS idx_pagination_state_user ON pagination_state(user_number, entity_type)`
    );

    // Create indexes for better query performance
    await query(
      `CREATE INDEX IF NOT EXISTS idx_tasks_user_number ON tasks(user_number)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_orders_user_number ON orders(user_number)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)`
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_pending_confirmations_user ON pending_confirmations(user_number)`
    );

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

