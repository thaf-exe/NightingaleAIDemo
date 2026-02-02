/**
 * Audit Log Entry
 * 
 * CRITICAL: No PHI (Protected Health Information) in logs!
 * - We store user_id_hash, not user_id
 * - We store event metadata, not message content
 * - This is required for HIPAA compliance
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  event_type: AuditEventType;
  user_id_hash: string; // SHA-256 hash of user ID
  ip_address_hash: string; // SHA-256 hash of IP
  user_agent_hash: string; // SHA-256 hash of user agent
  resource_type: string; // 'user', 'message', 'escalation', etc.
  resource_id_hash: string | null; // Hashed ID of affected resource
  action_result: 'success' | 'failure' | 'denied';
  failure_reason?: string;
  metadata: Record<string, unknown>; // Additional PHI-free context
}

/**
 * Types of events we audit
 */
export type AuditEventType =
  // Authentication events
  | 'auth.register'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.token_refresh'
  | 'auth.password_change'
  // Access control events
  | 'access.denied'
  | 'access.unauthorized'
  // Resource events
  | 'resource.create'
  | 'resource.read'
  | 'resource.update'
  | 'resource.delete'
  // Escalation events
  | 'escalation.created'
  | 'escalation.create'
  | 'escalation.viewed'
  | 'escalation.responded'
  | 'escalation.reply'
  | 'escalation.status_change'
  | 'escalation.resolve'
  // System events
  | 'system.error'
  | 'system.phi_redaction';

/**
 * Input for creating an audit log
 */
export interface CreateAuditLogInput {
  event_type: AuditEventType;
  user_id?: string; // Will be hashed before storage
  ip_address?: string; // Will be hashed before storage
  user_agent?: string; // Will be hashed before storage
  resource_type: string;
  resource_id?: string; // Will be hashed before storage
  action_result: 'success' | 'failure' | 'denied';
  failure_reason?: string;
  metadata?: Record<string, unknown>;
}
