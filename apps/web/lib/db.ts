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

