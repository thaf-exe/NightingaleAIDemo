/**
 * Nightingale AI Backend Server
 * 
 * This is the entry point for our backend application.
 * It sets up Express with all middleware and routes.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import routes from './routes';
import { testConnection, closePool } from './models/db';

// Load environment variables from .env file
dotenv.config();

// Create Express application
const app = express();
const PORT = process.env.PORT || 3001;

// ======================
// SECURITY MIDDLEWARE
// ======================

// CORS - Allow frontend to make requests (MUST be before Helmet)
// In production, restrict this to your frontend domain
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Helmet adds various HTTP headers for security
// Configure to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ======================
// BODY PARSING
// ======================

// Parse JSON bodies (limit size to prevent DoS)
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ======================
// REQUEST LOGGING (Development)
// ======================

if (process.env.NODE_ENV === 'development') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });
}

// ======================
// TRUST PROXY (for correct IP behind reverse proxy)
// ======================
app.set('trust proxy', 1);

// ======================
// API ROUTES
// ======================

app.use('/api', routes);

// ======================
// 404 HANDLER
// ======================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// ======================
// GLOBAL ERROR HANDLER
// ======================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'An unexpected error occurred',
    },
  });
});

// ======================
// START SERVER
// ======================

async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Exiting...');
    process.exit(1);
  }
  
  // Start listening
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🏥 Nightingale AI Backend Server                          ║
║                                                              ║
║   Server running on: http://localhost:${PORT}                  ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║                                                              ║
║   API Endpoints:                                             ║
║   • POST /api/auth/register - Create account                 ║
║   • POST /api/auth/login    - Login                          ║
║   • POST /api/auth/logout   - Logout                         ║
║   • GET  /api/auth/me       - Current user                   ║
║   • GET  /api/health        - Health check                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
}

// ======================
// GRACEFUL SHUTDOWN
// ======================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await closePool();
  process.exit(0);
});

// Start the server
startServer();

export default app;
