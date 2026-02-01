/**
 * Authentication Routes
 * 
 * POST /api/auth/register - Create new account
 * POST /api/auth/login - Get JWT token
 * POST /api/auth/logout - Revoke token
 * GET  /api/auth/me - Get current user info
 */

import { Router, Request, Response } from 'express';
import { AuthenticatedRequest, RegisterRequest, LoginRequest } from '../types';
import { createUser, usernameExists } from '../models/user.model';
import { logAuthEvent } from '../models/audit.model';
import { login, revokeSession } from '../services/auth.service';
import { validateRegistration } from '../utils/validation.utils';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * Get client IP (handles proxies)
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data: Partial<RegisterRequest> = req.body;
    
    // 1. Validate input
    const validation = validateRegistration(data);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please fix the following errors',
          details: validation.errors,
        },
      });
    }
    
    // 2. Check if username already exists
    const exists = await usernameExists(data.username!);
    if (exists) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USERNAME_EXISTS',
          message: 'This username is already taken. Please choose another.',
        },
      });
    }
    
    // 3. Create the user
    const user = await createUser(data as RegisterRequest);
    
    // 4. Log the registration
    await logAuthEvent(
      'auth.register',
      user.id,
      getClientIp(req),
      req.headers['user-agent'],
      true
    );
    
    // 5. Auto-login after registration
    const authResult = await login(
      { username: data.username!, password: data.password! },
      getClientIp(req),
      req.headers['user-agent']
    );
    
    // 6. Return user and token
    return res.status(201).json({
      success: true,
      data: authResult,
      meta: {
        timestamp: new Date(),
      },
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'REGISTRATION_ERROR',
        message: 'Unable to create account. Please try again.',
      },
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate and get JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password }: LoginRequest = req.body;
    
    // 1. Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Username and password are required.',
        },
      });
    }
    
    // 2. Attempt login
    const authResult = await login(
      { username, password },
      getClientIp(req),
      req.headers['user-agent']
    );
    
    // 3. Check result
    if (!authResult) {
      // Log failed attempt
      await logAuthEvent(
        'auth.login_failed',
        undefined,
        getClientIp(req),
        req.headers['user-agent'],
        false,
        'Invalid credentials'
      );
      
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password.',
        },
      });
    }
    
    // 4. Log successful login
    await logAuthEvent(
      'auth.login',
      authResult.user.id,
      getClientIp(req),
      req.headers['user-agent'],
      true
    );
    
    // 5. Return token
    return res.status(200).json({
      success: true,
      data: authResult,
      meta: {
        timestamp: new Date(),
      },
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'Unable to log in. Please try again.',
      },
    });
  }
});

/**
 * POST /api/auth/logout
 * Revoke current session
 */
router.post('/logout', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extract token from header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      await revokeSession(token);
      
      // Log logout
      await logAuthEvent(
        'auth.logout',
        req.user?.id,
        getClientIp(req),
        req.headers['user-agent'],
        true
      );
    }
    
    return res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
    
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: 'Unable to log out. Please try again.',
      },
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    data: { user: req.user },
    meta: {
      timestamp: new Date(),
    },
  });
});

export default router;
