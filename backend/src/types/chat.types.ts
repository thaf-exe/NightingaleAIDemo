/**
 * Chat Type Definitions
 * 
 * Types for conversations, messages, and AI interactions.
 */

// Risk levels for patient messages
export type RiskLevel = 'low' | 'medium' | 'high';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

// Who sent the message
export type SenderType = 'patient' | 'ai' | 'clinician';

// Conversation status
export type ConversationStatus = 'active' | 'escalated' | 'closed';

/**
 * A conversation between patient and AI
 */
export interface Conversation {
  id: string;
  patient_id: string;
  status: ConversationStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * A single message in a conversation
 */
export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  content: string; // Decrypted content
  
  // Risk assessment (for patient messages)
  risk_level?: RiskLevel;
  risk_reason?: string;
  risk_confidence?: ConfidenceLevel;
  risk_assessed_at?: Date;
  
  // AI metadata (for AI messages)
  ai_confidence?: ConfidenceLevel;
  ai_citations?: Record<string, unknown>;
  
  created_at: Date;
}

/**
 * Message as stored in database (encrypted)
 */
export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  content_encrypted: string;
  risk_level: RiskLevel | null;
  risk_reason: string | null;
  risk_confidence: ConfidenceLevel | null;
  risk_assessed_at: Date | null;
  ai_confidence: ConfidenceLevel | null;
  ai_citations: Record<string, unknown> | null;
  created_at: Date;
}

/**
 * Request to send a new message
 */
export interface SendMessageRequest {
  content: string;
  conversation_id?: string; // If not provided, create new conversation
}

/**
 * AI response from Groq
 */
export interface AIResponse {
  content: string;
  confidence: ConfidenceLevel;
  risk_assessment?: {
    level: RiskLevel;
    reason: string;
    confidence: ConfidenceLevel;
    should_escalate: boolean;
  };
  extracted_facts?: ExtractedFact[];
}

/**
 * Facts extracted from patient messages (Living Memory)
 */
export interface ExtractedFact {
  type: string; // 'symptom', 'medication', 'allergy', 'condition', etc.
  value: string;
  timeline?: string;
  status?: 'active' | 'stopped' | 'resolved';
  action?: 'add' | 'update' | 'remove'; // For corrections/mutations
  previous_value?: string; // If correcting a previous value
}

/**
 * Patient memory item (stored in database)
 */
export interface PatientMemory {
  id: string;
  patient_id: string;
  memory_type: string;
  value: string;
  status: 'active' | 'stopped' | 'resolved' | 'corrected';
  timeline?: string;
  provenance_message_id?: string;
  provenance_timestamp?: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Chat history for context
 */
export interface ChatContext {
  conversation_id: string;
  patient_name: string;
  patient_memory: PatientMemory[];
  recent_messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}
