// Re-export all types from a single entry point
export * from './user.types';
export * from './audit.types';

/**
 * Standard API response wrapper
 * All our endpoints return this shape for consistency
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: Date;
    requestId: string;
  };
}

/**
 * Express Request with authenticated user
 * After auth middleware runs, request will have this shape
 */
import { Request } from 'express';
import { UserPublic } from './user.types';

export interface AuthenticatedRequest extends Request {
  user?: UserPublic;
  requestId?: string;
}

/**
 * Clinic (for scoping clinician access)
 */
export interface Clinic {
  id: string;
  name: string;
  address?: string;
  created_at: Date;
  updated_at: Date;
}
