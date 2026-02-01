/**
 * Database Configuration
 * 
 * We use a "connection pool" instead of single connections.
 * 
 * WHY POOLS?
 * - Creating DB connections is expensive (slow)
 * - Pool keeps connections open and ready
 * - When you need a connection, pool gives you one
 * - When done, connection returns to pool (not closed)
 * - This makes your app much faster!
 */

import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database configuration from environment
const dbConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nightingale',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  
  // Pool settings
  max: 20, // Maximum connections in pool
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Timeout if can't connect in 2s
};

// Create the pool (doesn't connect yet - lazy connection)
const pool = new Pool(dbConfig);

// Log pool errors (connection issues, etc.)
pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

/**
 * Execute a query
 * @param text - SQL query string
 * @param params - Query parameters (prevents SQL injection!)
 */
export async function query<T = unknown>(
  text: string, 
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  // Log slow queries in development
  if (process.env.NODE_ENV === 'development' && duration > 100) {
    console.log('Slow query:', { text, duration: `${duration}ms`, rows: result.rowCount });
  }
  
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Get a client from the pool for transactions
 * Remember to release() when done!
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('✅ Database connected at:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Close all pool connections (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}

export default pool;
