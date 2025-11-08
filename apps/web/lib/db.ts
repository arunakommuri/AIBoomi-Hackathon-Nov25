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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
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

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
}

