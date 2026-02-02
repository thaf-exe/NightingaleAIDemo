/**
 * Authentication Middleware
 * 
 * This runs BEFORE protected routes.
 * It extracts the JWT from the Authorization header,
 * verifies it, and attaches the user to the request.
 * 
 * AUTHORIZATION HEADER FORMAT:
 * Authorization: Bearer <token>
 * 
 * "Bearer" is a convention that says "I'm bearing (carrying) this token"
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';
import { getUserFromToken, verifyToken } from '../services/auth.service';
import { logAccessDenied, logAuthEvent } from '../models/audit.model';
import { logError, createRequestContext } from '../utils/logger.utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Extract token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }
  
  // Format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Get client IP address (handles proxies)
 */
function getClientIp(req: Request): string {
  // Check for forwarded header (behind proxy/load balancer)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // Can be comma-separated list, take first
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Middleware: Require authentication
 * Rejects request if not authenticated
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Add request ID for tracing
  req.requestId = uuidv4();
  
  try {
    const token = extractToken(req);
    
    if (!token) {
      await logAccessDenied(
        undefined,
        getClientIp(req),
        req.headers['user-agent'],
        req.path,
        undefined,
        'No token provided'
      );
      
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please log in.',
        },
      });
      return;
    }
    
    // Get user from token (this also validates the session)
    const user = await getUserFromToken(token);
    
    if (!user) {
      await logAccessDenied(
        undefined,
        getClientIp(req),
        req.headers['user-agent'],
        req.path,
        undefined,
        'Invalid or expired token'
      );
      
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Your session has expired. Please log in again.',
        },
      });
      return;
    }
    
    // Attach user to request for use in route handlers
    req.user = user;
    next();
  } catch (error) {
    logError(
      'auth.middleware_error',
      'Authentication middleware encountered an error',
      error,
      createRequestContext(req.requestId, undefined, undefined, undefined, getClientIp(req))
    );
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication error. Please try again.',
      },
    });
  }
}

/**
 * Middleware Factory: Require specific role(s)
 * 
 * Usage:
 * app.get('/clinician-only', requireAuth, requireRole('clinician'), handler)
 * app.get('/admin-route', requireAuth, requireRole(['admin', 'superadmin']), handler)
 */
export function requireRole(allowedRoles: UserRole | UserRole[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // requireAuth must run first
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }
    
    // Check if user's role is in allowed roles
    if (!roles.includes(req.user.role)) {
      await logAccessDenied(
        req.user.id,
        getClientIp(req),
        req.headers['user-agent'],
        req.path,
        undefined,
        `Role '${req.user.role}' not authorized. Required: ${roles.join(' or ')}`
      );
      
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this resource.',
        },
      });
      return;
    }
    
    next();
  };
}

/**
 * Middleware: Require clinician with specific clinic access
 * Ensures clinicians can only access data from their own clinic
 */
export function requireClinicAccess(clinicIdParam: string = 'clinicId') {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
      return;
    }
    
    // Patients don't have clinic scope restrictions (they access their own data)
    if (req.user.role === 'patient') {
      next();
      return;
    }
    
    // Clinicians must be scoped to a clinic
    const requestedClinicId = req.params[clinicIdParam] || req.body?.clinic_id;
    
    if (!requestedClinicId) {
      // No clinic specified, allow if just accessing their own clinic's data
      next();
      return;
    }
    
    // Check if clinician belongs to the requested clinic
    if (req.user.clinic_id !== requestedClinicId) {
      await logAccessDenied(
        req.user.id,
        getClientIp(req),
        req.headers['user-agent'],
        req.path,
        requestedClinicId,
        'Clinician attempted to access different clinic'
      );
      
      res.status(403).json({
        success: false,
        error: {
          code: 'CLINIC_ACCESS_DENIED',
          message: 'You can only access data from your assigned clinic.',
        },
      });
      return;
    }
    
    next();
  };
}

/**
 * Optional auth middleware
 * Doesn't reject if not authenticated, but attaches user if token present
 */
export async function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  req.requestId = uuidv4();
  
  try {
    const token = extractToken(req);
    
    if (token) {
      const user = await getUserFromToken(token);
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
}
