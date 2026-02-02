/**
 * Structured Logging Utility
 * 
 * CRITICAL: All logs MUST be PHI-free for HIPAA compliance
 * 
 * This module provides structured JSON logging that:
 * 1. Never logs raw message content or patient data
 * 2. Logs only IDs, hashes, and metadata
 * 3. Outputs JSON format for easy parsing/analysis
 * 4. Includes context (request ID, user ID hash, timestamp)
 * 
 * WHAT NOT TO LOG:
 * - Patient names
 * - Message content
 * - Phone numbers
 * - Email addresses
 * - Any PHI (Protected Health Information)
 * 
 * WHAT TO LOG:
 * - Hashed IDs
 * - Event types
 * - Timestamps
 * - Error codes (not messages)
 * - Aggregated statistics
 */

import { sha256Hash } from './hash.utils';

/**
 * Log levels matching standard severity
 */
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

/**
 * Structured log entry format
 */
export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  context?: {
    requestId?: string;
    userIdHash?: string;
    resourceType?: string;
    resourceIdHash?: string;
    ipAddressHash?: string;
  };
  metadata?: Record<string, unknown>;
  error?: {
    code?: string;
    type?: string;
    stack?: string;
  };
}

/**
 * Sanitize error objects to remove potential PHI
 */
function sanitizeError(error: unknown): { code?: string; type?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      type: error.name,
      code: (error as any).code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    };
  }
  return { type: 'UnknownError' };
}

/**
 * Log a structured entry
 */
function logStructured(entry: StructuredLog): void {
  // In production, this would be sent to a logging service (CloudWatch, Datadog, etc.)
  // For now, output as JSON to stdout
  console.log(JSON.stringify(entry));
}

/**
 * Log an error event (PHI-free)
 */
export function logError(
  event: string,
  message: string,
  error?: unknown,
  context?: StructuredLog['context'],
  metadata?: Record<string, unknown>
): void {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level: LogLevel.ERROR,
    event,
    message,
    context,
    metadata,
    error: error ? sanitizeError(error) : undefined,
  };
  logStructured(entry);
}

/**
 * Log a warning event
 */
export function logWarning(
  event: string,
  message: string,
  context?: StructuredLog['context'],
  metadata?: Record<string, unknown>
): void {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level: LogLevel.WARN,
    event,
    message,
    context,
    metadata,
  };
  logStructured(entry);
}

/**
 * Log an info event
 */
export function logInfo(
  event: string,
  message: string,
  context?: StructuredLog['context'],
  metadata?: Record<string, unknown>
): void {
  const entry: StructuredLog = {
    timestamp: new Date().toISOString(),
    level: LogLevel.INFO,
    event,
    message,
    context,
    metadata,
  };
  logStructured(entry);
}

/**
 * Log a debug event (only in development)
 */
export function logDebug(
  event: string,
  message: string,
  context?: StructuredLog['context'],
  metadata?: Record<string, unknown>
): void {
  if (process.env.NODE_ENV === 'development') {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      event,
      message,
      context,
      metadata,
    };
    logStructured(entry);
  }
}

/**
 * Helper to create context from request
 */
export function createRequestContext(
  requestId?: string,
  userId?: string,
  resourceType?: string,
  resourceId?: string,
  ipAddress?: string
): StructuredLog['context'] {
  return {
    requestId,
    userIdHash: userId ? sha256Hash(userId) : undefined,
    resourceType,
    resourceIdHash: resourceId ? sha256Hash(resourceId) : undefined,
    ipAddressHash: ipAddress ? sha256Hash(ipAddress) : undefined,
  };
}

/**
 * Log PHI redaction event (for compliance tracking)
 */
export function logPhiRedaction(
  namesRedacted: number,
  idNumbersRedacted: number,
  phonesRedacted: number,
  context?: StructuredLog['context']
): void {
  logInfo(
    'phi.redaction',
    'PHI redacted before LLM processing',
    context,
    {
      namesRedacted,
      idNumbersRedacted,
      phonesRedacted,
      totalRedactions: namesRedacted + idNumbersRedacted + phonesRedacted,
    }
  );
}

/**
 * Log system error (no user context)
 */
export function logSystemError(
  event: string,
  message: string,
  error?: unknown,
  metadata?: Record<string, unknown>
): void {
  logError(event, message, error, undefined, metadata);
}

export default {
  logError,
  logWarning,
  logInfo,
  logDebug,
  createRequestContext,
  logPhiRedaction,
  logSystemError,
};
