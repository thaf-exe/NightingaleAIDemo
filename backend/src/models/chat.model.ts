/**
 * Chat Model
 * 
 * Database operations for conversations and messages.
 * Handles encryption/decryption of message content.
 */

import { query } from './db';
import { encrypt, decrypt } from '../utils/encryption.utils';
import type { 
  Conversation, 
  Message, 
  MessageRow,
  PatientMemory,
  ExtractedFact,
  SenderType,
  RiskLevel,
  ConfidenceLevel
} from '../types/chat.types';

/**
 * Create a new conversation
 */
export async function createConversation(patientId: string): Promise<Conversation> {
  const result = await query<Conversation>(
    `INSERT INTO conversations (user_id, status)
     VALUES ($1, 'active')
     RETURNING id, user_id as patient_id, status, created_at, updated_at`,
    [patientId]
  );
  
  return result.rows[0];
}

/**
 * Get conversation by ID
 */
export async function getConversationById(id: string): Promise<Conversation | null> {
  const result = await query<Conversation>(
    `SELECT id, user_id as patient_id, status, created_at, updated_at
     FROM conversations
     WHERE id = $1`,
    [id]
  );
  
  return result.rows[0] || null;
}

/**
 * Get active conversation for patient
 */
export async function getActiveConversation(patientId: string): Promise<Conversation | null> {
  const result = await query<Conversation>(
    `SELECT id, user_id as patient_id, status, created_at, updated_at
     FROM conversations
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [patientId]
  );
  
  return result.rows[0] || null;
}

/**
 * Get all conversations for a patient
 */
export async function getPatientConversations(patientId: string): Promise<Conversation[]> {
  const result = await query<Conversation>(
    `SELECT id, user_id as patient_id, status, created_at, updated_at
     FROM conversations
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [patientId]
  );
  
  return result.rows;
}

/**
 * Update conversation status
 */
export async function updateConversationStatus(
  id: string, 
  status: 'active' | 'escalated' | 'closed'
): Promise<Conversation | null> {
  const result = await query<Conversation>(
    `UPDATE conversations 
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, user_id as patient_id, status, created_at, updated_at`,
    [id, status]
  );
  
  return result.rows[0] || null;
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(id: string): Promise<boolean> {
  // Delete patient memory entries that originated from this conversation's messages
  await query(
    `DELETE FROM patient_memory 
     WHERE provenance_message_id IN (
       SELECT id FROM messages WHERE conversation_id = $1
     )`,
    [id]
  );
  
  // Delete messages (foreign key constraint)
  await query('DELETE FROM messages WHERE conversation_id = $1', [id]);
  
  // Delete the conversation
  const result = await query(
    'DELETE FROM conversations WHERE id = $1 RETURNING id',
    [id]
  );
  
  return result.rows.length > 0;
}

/**
 * Create a new message (encrypted)
 */
export async function createMessage(
  conversationId: string,
  senderType: SenderType,
  senderId: string | null,
  content: string,
  options?: {
    riskLevel?: RiskLevel;
    riskReason?: string;
    riskConfidence?: ConfidenceLevel;
    aiConfidence?: ConfidenceLevel;
    aiCitations?: Record<string, unknown>;
  }
): Promise<Message> {
  // Encrypt the message content
  const encryptedContent = encrypt(content);
  
  const result = await query<MessageRow>(
    `INSERT INTO messages (
      conversation_id, sender_type, sender_id, content_encrypted,
      risk_level, risk_reason, risk_confidence, risk_assessed_at,
      ai_confidence, ai_citations
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      conversationId,
      senderType,
      senderId,
      encryptedContent,
      options?.riskLevel || null,
      options?.riskReason || null,
      options?.riskConfidence || null,
      options?.riskLevel ? new Date() : null,
      options?.aiConfidence || null,
      options?.aiCitations ? JSON.stringify(options.aiCitations) : null,
    ]
  );
  
  // Update conversation timestamp
  await query(
    `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [conversationId]
  );
  
  // Return decrypted message
  return decryptMessage(result.rows[0]);
}

/**
 * Get messages for a conversation (decrypted)
 */
export async function getConversationMessages(
  conversationId: string,
  limit = 50
): Promise<Message[]> {
  const result = await query<MessageRow>(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [conversationId, limit]
  );
  
  return result.rows.map(decryptMessage);
}

/**
 * Get recent messages for AI context (decrypted)
 */
export async function getRecentMessages(
  conversationId: string,
  limit = 10
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  const messages = await getConversationMessages(conversationId, limit);
  
  return messages.map(msg => {
    if (msg.sender_type === 'patient') {
      return { role: 'user' as const, content: msg.content };
    } else if (msg.sender_type === 'clinician') {
      // Clinician messages are ground truth - map to system role with clear prefix
      return { 
        role: 'system' as const, 
        content: `CLINICIAN GUIDANCE: ${msg.content}` 
      };
    } else {
      return { role: 'assistant' as const, content: msg.content };
    }
  });
}

/**
 * Helper to decrypt a message row
 */
function decryptMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_type: row.sender_type,
    sender_id: row.sender_id,
    content: decrypt(row.content_encrypted),
    risk_level: row.risk_level || undefined,
    risk_reason: row.risk_reason || undefined,
    risk_confidence: row.risk_confidence || undefined,
    risk_assessed_at: row.risk_assessed_at || undefined,
    ai_confidence: row.ai_confidence || undefined,
    ai_citations: row.ai_citations || undefined,
    created_at: row.created_at,
  };
}

// ============================================
// PATIENT MEMORY (Living Memory Feature)
// ============================================

/**
 * Get patient's memory (health profile)
 * Includes active and stopped items, excludes corrected (false positives)
 */
export async function getPatientMemory(patientId: string): Promise<PatientMemory[]> {
  const result = await query<PatientMemory>(
    `SELECT id, user_id as patient_id, memory_type, value, status, timeline,
            provenance_message_id, provenance_timestamp, created_at, updated_at
     FROM patient_memory
     WHERE user_id = $1 AND status IN ('active', 'stopped', 'resolved')
     ORDER BY memory_type, status DESC, created_at DESC`,
    [patientId]
  );
  
  return result.rows;
}

/**
 * Add facts to patient memory (handles add, update, and remove actions)
 */
export async function addToPatientMemory(
  patientId: string,
  facts: ExtractedFact[],
  messageId: string
): Promise<PatientMemory[]> {
  const affectedMemories: PatientMemory[] = [];
  
  for (const fact of facts) {
    const action = fact.action || 'add';
    
    if (action === 'update' || action === 'remove') {
      // Find existing memory to update
      const valueToFind = fact.previous_value || fact.value;
      const existing = await query<PatientMemory>(
        `SELECT id, user_id as patient_id, memory_type, value, status, timeline,
                provenance_message_id, provenance_timestamp, created_at, updated_at
         FROM patient_memory
         WHERE user_id = $1 AND memory_type = $2 AND LOWER(value) = LOWER($3) AND status = 'active'`,
        [patientId, fact.type, valueToFind]
      );
      
      if (existing.rows.length > 0) {
        const memoryId = existing.rows[0].id;
        
        if (action === 'remove') {
          // Mark as corrected (patient said they don't have this)
          const result = await query<PatientMemory>(
            `UPDATE patient_memory
             SET status = 'corrected', updated_at = CURRENT_TIMESTAMP, timeline = $2
             WHERE id = $1
             RETURNING id, user_id as patient_id, memory_type, value, status, timeline,
                       provenance_message_id, provenance_timestamp, created_at, updated_at`,
            [memoryId, fact.timeline || 'corrected by patient']
          );
          if (result.rows[0]) affectedMemories.push(result.rows[0]);
        } else {
          // Update status (e.g., medication stopped)
          const result = await query<PatientMemory>(
            `UPDATE patient_memory
             SET status = $2, timeline = COALESCE($3, timeline), updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, user_id as patient_id, memory_type, value, status, timeline,
                       provenance_message_id, provenance_timestamp, created_at, updated_at`,
            [memoryId, fact.status || 'stopped', fact.timeline]
          );
          if (result.rows[0]) affectedMemories.push(result.rows[0]);
        }
      }
    } else {
      // Add new fact (default behavior)
      // Check if this fact already exists (avoid duplicates)
      const existing = await query<PatientMemory>(
        `SELECT id FROM patient_memory
         WHERE user_id = $1 AND memory_type = $2 AND LOWER(value) = LOWER($3) AND status = 'active'`,
        [patientId, fact.type, fact.value]
      );
      
      if (existing.rows.length === 0) {
        const result = await query<PatientMemory>(
          `INSERT INTO patient_memory (
            user_id, memory_type, value, status, timeline,
            provenance_message_id, provenance_timestamp
          )
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          RETURNING id, user_id as patient_id, memory_type, value, status, timeline,
                    provenance_message_id, provenance_timestamp, created_at, updated_at`,
          [
            patientId,
            fact.type,
            fact.value,
            fact.status || 'active',
            fact.timeline || null,
            messageId,
          ]
        );
        
        if (result.rows[0]) affectedMemories.push(result.rows[0]);
      }
    }
  }
  
  return affectedMemories;
}

/**
 * Update memory status (e.g., mark medication as stopped)
 */
export async function updateMemoryStatus(
  memoryId: string,
  status: 'active' | 'stopped' | 'resolved' | 'corrected'
): Promise<PatientMemory | null> {
  const result = await query<PatientMemory>(
    `UPDATE patient_memory
     SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [memoryId, status]
  );
  
  return result.rows[0] || null;
}

export default {
  createConversation,
  getConversationById,
  getActiveConversation,
  getPatientConversations,
  updateConversationStatus,
  createMessage,
  getConversationMessages,
  getRecentMessages,
  getPatientMemory,
  addToPatientMemory,
  updateMemoryStatus,
};
