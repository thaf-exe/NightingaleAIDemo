/**
 * TypeScript types for the frontend
 * These should match what the backend sends/expects
 */

// User roles - must match backend
export type UserRole = 'patient' | 'clinician';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

// User object returned from API
export interface User {
  id: string;
  username: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender;
  clinic_id: string | null;
  created_at: string;
}

// Registration form data
export interface RegisterData {
  username: string;
  password: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender;
  clinic_id?: string;
}

// Login form data
export interface LoginData {
  username: string;
  password: string;
}

// Auth response from backend
export interface AuthResponse {
  user: User;
  token: string;
  expiresAt: string;
}

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: ValidationError[];
  };
  meta?: {
    timestamp: string;
  };
}

// Validation error from backend
export interface ValidationError {
  field: string;
  message: string;
}

// Auth context type
export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

// ============================================
// CHAT TYPES
// ============================================

export type RiskLevel = 'low' | 'medium' | 'high';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type SenderType = 'patient' | 'ai' | 'clinician';
export type ConversationStatus = 'active' | 'escalated' | 'closed';

export interface Conversation {
  id: string;
  patient_id: string;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id: string | null;
  content: string;
  risk_level?: RiskLevel;
  risk_reason?: string;
  created_at: string;
}

export interface ChatResponse {
  conversation_id: string;
  patient_message: {
    id: string;
    content: string;
    created_at: string;
  };
  ai_message: {
    id: string;
    content: string;
    confidence: ConfidenceLevel;
    created_at: string;
  };
  risk_assessment?: {
    level: RiskLevel;
    reason: string;
    confidence: ConfidenceLevel;
    should_escalate: boolean;
  };
  escalation_warning?: {
    level: RiskLevel;
    message: string;
  };
}

export interface PatientMemory {
  id: string;
  patient_id: string;
  memory_type: string;
  value: string;
  status: 'active' | 'stopped' | 'resolved' | 'corrected';
  timeline?: string;
  provenance_message_id?: string;  // Links to source message (proof of extraction)
  provenance_timestamp?: string;    // When the fact was stated
  created_at: string;
  updated_at: string;               // Last modification timestamp
}

export interface PatientMemoryResponse {
  items: PatientMemory[];
  grouped: Record<string, PatientMemory[]>;
}

// Escalation types
export interface Escalation {
  id: string;
  status: 'pending' | 'viewed' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  resolved_at?: string;
}

export interface EscalationCreateResponse {
  escalation_id: string;
  status: string;
  priority: string;
  message: string;
}

export interface TriageQueueItem {
  id: string;
  patient_name: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'viewed' | 'in_progress';
  triage_summary: string[];
  created_at: string;
  assigned_to_me: boolean;
}

export interface EscalationDetails {
  escalation: {
    id: string;
    patient_name: string;
    patient_email: string;
    priority: string;
    status: string;
    trigger_reason: string;
    triggering_message?: string;
    triage_summary: string[];
    profile_snapshot: {
      patient_name: string;
      captured_at: string;
      memory_items: Array<{
        type: string;
        value: string;
        status?: string;
        timeline?: string;
      }>;
    };
    created_at: string;
  };
  conversation_history: Array<{
    id: string;
    sender_type: 'patient' | 'ai' | 'clinician';
    content: string;
    created_at: string;
    risk_level?: RiskLevel;
  }>;
}

export interface ClinicianReplyResponse {
  replies: Array<{
    id: string;
    content: string;
    sender_type: 'clinician';
    created_at: string;
  }>;
  has_new: boolean;
}
