/**
 * Escalation Model
 * 
 * Database operations for the escalation/triage system.
 * Handles creating escalations, clinician queue, and clinician replies.
 */

import { query } from './db';
import { encrypt, decrypt } from '../utils/encryption.utils';

export interface Escalation {
  id: string;
  conversation_id: string;
  patient_id: string;
  clinic_id: string;
  assigned_clinician_id: string | null;
  triggering_message_id: string | null;
  trigger_reason: string;
  triage_summary: string[];
  profile_snapshot: Record<string, unknown>;
  status: 'pending' | 'viewed' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  resolved_at: Date | null;
  resolution_notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EscalationWithPatient extends Escalation {
  patient_name: string;
  patient_email: string;
  triggering_message_content?: string;
}

export interface ClinicianReply {
  id: string;
  escalation_id: string;
  clinician_id: string;
  clinician_name: string;
  content: string;
  created_at: Date;
}

/**
 * Create a new escalation
 */
export async function createEscalation(
  conversationId: string,
  patientId: string,
  clinicId: string,
  triggeringMessageId: string,
  triggerReason: string,
  triageSummary: string[],
  profileSnapshot: Record<string, unknown>,
  priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium'
): Promise<Escalation> {
  const result = await query<Escalation>(
    `INSERT INTO escalations (
      conversation_id, patient_id, clinic_id, triggering_message_id,
      trigger_reason, triage_summary, profile_snapshot, priority
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      conversationId,
      patientId,
      clinicId,
      triggeringMessageId,
      triggerReason,
      JSON.stringify(triageSummary),
      JSON.stringify(profileSnapshot),
      priority,
    ]
  );
  
  return result.rows[0];
}

/**
 * Get escalation by ID
 */
export async function getEscalationById(id: string): Promise<Escalation | null> {
  const result = await query<Escalation>(
    `SELECT * FROM escalations WHERE id = $1`,
    [id]
  );
  
  return result.rows[0] || null;
}

/**
 * Get escalation by conversation ID
 */
export async function getEscalationByConversationId(conversationId: string): Promise<Escalation | null> {
  const result = await query<Escalation>(
    `SELECT * FROM escalations 
     WHERE conversation_id = $1 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [conversationId]
  );
  
  return result.rows[0] || null;
}

/**
 * Get all pending escalations for a clinic (Triage Queue)
 */
export async function getClinicTriageQueue(clinicId: string): Promise<EscalationWithPatient[]> {
  const result = await query<EscalationWithPatient>(
    `SELECT e.*,
            u.first_name || ' ' || u.last_name as patient_name,
            u.username as patient_email
     FROM escalations e
     JOIN users u ON e.patient_id = u.id
     WHERE e.clinic_id = $1 AND e.status IN ('pending', 'viewed', 'in_progress')
     ORDER BY 
       CASE e.priority
         WHEN 'urgent' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
       END,
       e.created_at ASC`,
    [clinicId]
  );
  
  return result.rows;
}

/**
 * Get escalation with full details for clinician view
 */
export async function getEscalationDetails(
  escalationId: string,
  clinicId: string
): Promise<EscalationWithPatient | null> {
  const result = await query<EscalationWithPatient & { triggering_message_content_encrypted: string }>(
    `SELECT e.*,
            u.first_name || ' ' || u.last_name as patient_name,
            u.username as patient_email,
            m.content_encrypted as triggering_message_content_encrypted
     FROM escalations e
     JOIN users u ON e.patient_id = u.id
     LEFT JOIN messages m ON e.triggering_message_id = m.id
     WHERE e.id = $1 AND e.clinic_id = $2`,
    [escalationId, clinicId]
  );
  
  if (!result.rows[0]) return null;
  
  const row = result.rows[0];
  
  // Build the escalation object, excluding the encrypted field
  const { triggering_message_content_encrypted, ...rest } = row;
  const escalation: EscalationWithPatient = {
    ...rest,
    triggering_message_content: triggering_message_content_encrypted 
      ? decrypt(triggering_message_content_encrypted)
      : undefined,
  };
  
  return escalation;
}

/**
 * Update escalation status
 */
export async function updateEscalationStatus(
  escalationId: string,
  status: 'pending' | 'viewed' | 'in_progress' | 'resolved',
  resolutionNotes?: string
): Promise<Escalation | null> {
  const result = await query<Escalation>(
    `UPDATE escalations 
     SET status = $2::varchar,
         resolved_at = CASE WHEN $2::varchar = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
         resolution_notes = COALESCE($3, resolution_notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [escalationId, status, resolutionNotes || null]
  );
  
  return result.rows[0] || null;
}

/**
 * Assign clinician to escalation
 */
export async function assignClinician(
  escalationId: string,
  clinicianId: string
): Promise<Escalation | null> {
  const result = await query<Escalation>(
    `UPDATE escalations 
     SET assigned_clinician_id = $2,
         status = CASE WHEN status = 'pending' THEN 'viewed' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [escalationId, clinicianId]
  );
  
  return result.rows[0] || null;
}

/**
 * Add clinician reply to conversation
 * This creates a message in the conversation with sender_type = 'clinician'
 */
export async function addClinicianReply(
  conversationId: string,
  clinicianId: string,
  content: string,
  escalationId: string
): Promise<{ messageId: string; escalationUpdated: boolean }> {
  // Encrypt the message content
  const encryptedContent = encrypt(content);
  
  // Insert clinician message
  const messageResult = await query<{ id: string }>(
    `INSERT INTO messages (
      conversation_id, sender_type, sender_id, content_encrypted
    )
    VALUES ($1, 'clinician', $2, $3)
    RETURNING id`,
    [conversationId, clinicianId, encryptedContent]
  );
  
  // Update escalation to in_progress if it was pending/viewed
  const escalationResult = await query<Escalation>(
    `UPDATE escalations 
     SET status = CASE WHEN status IN ('pending', 'viewed') THEN 'in_progress' ELSE status END,
         assigned_clinician_id = COALESCE(assigned_clinician_id, $2),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [escalationId, clinicianId]
  );
  
  return {
    messageId: messageResult.rows[0].id,
    escalationUpdated: escalationResult.rowCount! > 0,
  };
}

/**
 * Get clinician replies for a conversation (for patient view)
 * Returns all messages from clinicians in the conversation
 */
export async function getClinicianReplies(conversationId: string): Promise<ClinicianReply[]> {
  const result = await query<{
    id: string;
    escalation_id: string;
    sender_id: string;
    clinician_name: string;
    content_encrypted: string;
    created_at: Date;
  }>(
    `SELECT m.id,
            e.id as escalation_id,
            m.sender_id,
            u.first_name || ' ' || u.last_name as clinician_name,
            m.content_encrypted,
            m.created_at
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     LEFT JOIN escalations e ON e.conversation_id = m.conversation_id
     WHERE m.conversation_id = $1 AND m.sender_type = 'clinician'
     ORDER BY m.created_at ASC`,
    [conversationId]
  );
  
  return result.rows.map(row => ({
    id: row.id,
    escalation_id: row.escalation_id,
    clinician_id: row.sender_id,
    clinician_name: row.clinician_name,
    content: decrypt(row.content_encrypted),
    created_at: row.created_at,
  }));
}

/**
 * Check if conversation has pending clinician replies since a given timestamp
 * Used for async polling
 */
export async function hasNewClinicianReplies(
  conversationId: string,
  sinceTimestamp: Date
): Promise<boolean> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM messages
     WHERE conversation_id = $1 
       AND sender_type = 'clinician'
       AND created_at > $2`,
    [conversationId, sinceTimestamp]
  );
  
  return parseInt(result.rows[0].count) > 0;
}

export default {
  createEscalation,
  getEscalationById,
  getEscalationByConversationId,
  getClinicTriageQueue,
  getEscalationDetails,
  updateEscalationStatus,
  assignClinician,
  addClinicianReply,
  getClinicianReplies,
  hasNewClinicianReplies,
};
