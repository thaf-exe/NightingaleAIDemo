/**
 * Audit Log Model
 * 
 * CRITICAL FOR HEALTHCARE COMPLIANCE:
 * - All identifiers are HASHED before storage
 * - No PHI (Protected Health Information) is stored
 * - This allows compliance auditing without exposing patient data
 */

import { query } from './db';
import { AuditLogEntry, CreateAuditLogInput, AuditEventType } from '../types';
import { sha256Hash } from '../utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Create an audit log entry
 * All identifiable information is hashed automatically
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<void> {
  const sql = `
    INSERT INTO audit_logs (
      id, event_type, user_id_hash, ip_address_hash, user_agent_hash,
      resource_type, resource_id_hash, action_result, failure_reason, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  
  const params = [
    uuidv4(),
    input.event_type,
    input.user_id ? sha256Hash(input.user_id) : null,
    input.ip_address ? sha256Hash(input.ip_address) : null,
    input.user_agent ? sha256Hash(input.user_agent) : null,
    input.resource_type,
    input.resource_id ? sha256Hash(input.resource_id) : null,
    input.action_result,
    input.failure_reason || null,
    JSON.stringify(input.metadata || {}),
  ];
  
  await query(sql, params);
}

/**
 * Get audit logs by event type (for compliance reporting)
 */
export async function getAuditLogsByEventType(
  eventType: AuditEventType,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  const sql = `
    SELECT * FROM audit_logs 
    WHERE event_type = $1 
    ORDER BY timestamp DESC 
    LIMIT $2
  `;
  const result = await query<AuditLogEntry>(sql, [eventType, limit]);
  return result.rows;
}

/**
 * Get recent audit logs
 */
export async function getRecentAuditLogs(limit: number = 100): Promise<AuditLogEntry[]> {
  const sql = `
    SELECT * FROM audit_logs 
    ORDER BY timestamp DESC 
    LIMIT $1
  `;
  const result = await query<AuditLogEntry>(sql, [limit]);
  return result.rows;
}

/**
 * Get audit logs for a specific user (by hashed ID)
 * Used when you already have the hashed user ID
 */
export async function getAuditLogsByUserHash(
  userIdHash: string,
  limit: number = 100
): Promise<AuditLogEntry[]> {
  const sql = `
    SELECT * FROM audit_logs 
    WHERE user_id_hash = $1 
    ORDER BY timestamp DESC 
    LIMIT $2
  `;
  const result = await query<AuditLogEntry>(sql, [userIdHash, limit]);
  return result.rows;
}

/**
 * Helper to log auth events
 */
export async function logAuthEvent(
  eventType: 'auth.register' | 'auth.login' | 'auth.logout' | 'auth.login_failed',
  userId: string | undefined,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  success: boolean,
  failureReason?: string
): Promise<void> {
  await createAuditLog({
    event_type: eventType,
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
    resource_type: 'user',
    resource_id: userId,
    action_result: success ? 'success' : 'failure',
    failure_reason: failureReason,
    metadata: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Helper to log access denied events
 */
export async function logAccessDenied(
  userId: string | undefined,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  resourceType: string,
  resourceId: string | undefined,
  reason: string
): Promise<void> {
  await createAuditLog({
    event_type: 'access.denied',
    user_id: userId,
    ip_address: ipAddress,
    user_agent: userAgent,
    resource_type: resourceType,
    resource_id: resourceId,
    action_result: 'denied',
    failure_reason: reason,
    metadata: {
      timestamp: new Date().toISOString(),
    },
  });
}
