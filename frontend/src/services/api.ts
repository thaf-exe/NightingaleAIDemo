/**
 * API Service
 * 
 * This module handles all HTTP communication with the backend.
 * We use Axios for HTTP requests because it:
 * - Automatically transforms JSON
 * - Has better error handling than fetch
 * - Supports interceptors (for adding auth headers)
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';
import type { ApiResponse, AuthResponse, LoginData, RegisterData } from '../types';

// Base URL for API calls
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Create Axios instance with defaults
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

/**
 * INTERCEPTOR: Add auth token to every request
 * 
 * Interceptors run BEFORE each request/response.
 * This automatically adds the JWT token from localStorage
 * to every outgoing request.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * INTERCEPTOR: Handle response errors globally
 * 
 * This catches auth errors (401) and can trigger logout
 * or token refresh automatically.
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    // If 401 Unauthorized, clear token and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      // Optionally redirect to login
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Extract error message from API error
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiResponse>;
    // Return the API error message if available
    if (axiosError.response?.data?.error?.message) {
      return axiosError.response.data.error.message;
    }
    // Network error
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Unable to connect to server. Please check your internet connection.';
    }
    // Timeout
    if (axiosError.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
    }
  }
  // Generic error
  return 'An unexpected error occurred. Please try again.';
}

// ==================
// AUTH API CALLS
// ==================

/**
 * Register a new user
 */
export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', data);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Registration failed');
  }
  return response.data.data;
}

/**
 * Login user
 */
export async function loginUser(data: LoginData): Promise<AuthResponse> {
  const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', data);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Login failed');
  }
  return response.data.data;
}

/**
 * Logout user
 */
export async function logoutUser(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    // Even if logout fails on server, clear local data
    console.error('Logout error:', error);
  }
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<ApiResponse<{ user: import('../types').User }>> {
  const response = await api.get<ApiResponse<{ user: import('../types').User }>>('/auth/me');
  return response.data;
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await api.get('/health');
    return response.data.success;
  } catch {
    return false;
  }
}

// ==================
// CHAT API CALLS
// ==================

import type { 
  ChatResponse, 
  Conversation, 
  Message, 
  PatientMemoryResponse 
} from '../types';

/**
 * Send a chat message and get AI response
 */
export async function sendMessage(
  content: string, 
  conversationId?: string
): Promise<ChatResponse> {
  const response = await api.post<ApiResponse<ChatResponse>>('/chat/message', {
    content,
    conversation_id: conversationId,
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send message');
  }
  return response.data.data;
}

/**
 * Get all conversations for current user
 */
export async function getConversations(): Promise<Conversation[]> {
  const response = await api.get<ApiResponse<Conversation[]>>('/chat/conversations');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch conversations');
  }
  return response.data.data;
}

/**
 * Get the active conversation with messages (if any)
 */
export async function getActiveConversation(): Promise<{
  conversation: Conversation;
  messages: Message[];
} | null> {
  const response = await api.get<ApiResponse<{
    conversation: Conversation;
    messages: Message[];
  } | null>>('/chat/conversations/active');
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to fetch active conversation');
  }
  return response.data.data || null;
}

/**
 * Get a specific conversation with messages
 */
export async function getConversation(id: string): Promise<{
  conversation: Conversation;
  messages: Message[];
}> {
  const response = await api.get<ApiResponse<{
    conversation: Conversation;
    messages: Message[];
  }>>(`/chat/conversations/${id}`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch conversation');
  }
  return response.data.data;
}

/**
 * Start a new conversation
 */
export async function startNewConversation(): Promise<Conversation> {
  const response = await api.post<ApiResponse<Conversation>>('/chat/conversations/new');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to create conversation');
  }
  return response.data.data;
}

/**
 * Close a conversation
 */
export async function closeConversation(id: string): Promise<Conversation> {
  const response = await api.post<ApiResponse<Conversation>>(`/chat/conversations/${id}/close`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to close conversation');
  }
  return response.data.data;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(id: string): Promise<void> {
  try {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/chat/conversations/${id}`);
    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete conversation');
    }
  } catch (error: any) {
    // Extract the error message from the API response
    const message = error.response?.data?.error?.message || 'Failed to delete conversation';
    throw new Error(message);
  }
}

/**
 * Get patient's health memory/profile
 */
export async function getPatientMemory(): Promise<PatientMemoryResponse> {
  const response = await api.get<ApiResponse<PatientMemoryResponse>>('/chat/memory');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch health profile');
  }
  return response.data.data;
}

// =============================================
// ESCALATION API
// =============================================

import type { 
  EscalationCreateResponse, 
  TriageQueueItem, 
  EscalationDetails,
  ClinicianReplyResponse,
  Escalation 
} from '../types';

/**
 * Create escalation - "Send to Nurse/Clinic"
 */
export async function createEscalation(
  conversationId: string,
  triggeringMessageId?: string
): Promise<EscalationCreateResponse> {
  const response = await api.post<ApiResponse<EscalationCreateResponse>>('/escalations', {
    conversation_id: conversationId,
    triggering_message_id: triggeringMessageId,
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to escalate');
  }
  return response.data.data;
}

/**
 * Get escalation status for a conversation
 */
export async function getEscalationStatus(conversationId: string): Promise<Escalation | null> {
  const response = await api.get<ApiResponse<Escalation | null>>(`/escalations/conversation/${conversationId}`);
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to get escalation status');
  }
  return response.data.data || null;
}

/**
 * Poll for clinician replies (async update)
 */
export async function pollClinicianReplies(
  conversationId: string,
  since?: string
): Promise<ClinicianReplyResponse> {
  const params = since ? `?since=${encodeURIComponent(since)}` : '';
  const response = await api.get<ApiResponse<ClinicianReplyResponse>>(
    `/escalations/replies/${conversationId}${params}`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to poll replies');
  }
  return response.data.data;
}

/**
 * Get triage queue (clinician only)
 */
export async function getTriageQueue(): Promise<TriageQueueItem[]> {
  const response = await api.get<ApiResponse<TriageQueueItem[]>>('/escalations/queue');
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch triage queue');
  }
  return response.data.data;
}

/**
 * Get escalation details (clinician only)
 */
export async function getEscalationDetails(escalationId: string): Promise<EscalationDetails> {
  const response = await api.get<ApiResponse<EscalationDetails>>(`/escalations/${escalationId}`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to fetch escalation details');
  }
  return response.data.data;
}

/**
 * Send clinician reply
 */
export async function sendClinicianReply(
  escalationId: string,
  content: string
): Promise<{ message_id: string; sent_at: string }> {
  const response = await api.post<ApiResponse<{ message_id: string; sent_at: string }>>(
    `/escalations/${escalationId}/reply`,
    { content }
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to send reply');
  }
  return response.data.data;
}

/**
 * Update escalation status (clinician only)
 */
export async function updateEscalationStatus(
  escalationId: string,
  status: 'viewed' | 'in_progress' | 'resolved'
): Promise<void> {
  const response = await api.patch<ApiResponse<unknown>>(`/escalations/${escalationId}/status`, { status });
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to update status');
  }
}

/**
 * Resolve escalation (clinician only)
 */
export async function resolveEscalation(
  escalationId: string,
  resolutionNotes?: string
): Promise<void> {
  const response = await api.post<ApiResponse<unknown>>(`/escalations/${escalationId}/resolve`, {
    resolution_notes: resolutionNotes,
  });
  if (!response.data.success) {
    throw new Error(response.data.error?.message || 'Failed to resolve escalation');
  }
}

// =============================================
// VOICE API
// =============================================

export interface VoiceChatResponse {
  conversation_id: string;
  transcript: string;
  patient_message: {
    id: string;
    content: string;
    created_at: string;
  };
  ai_message: {
    id: string;
    content: string;
    citations?: string[];
    created_at: string;
  };
  audio: string; // Base64 encoded MP3
  risk_assessment?: {
    level: 'low' | 'medium' | 'high';
    reason?: string;
    confidence?: 'low' | 'medium' | 'high';
  };
  escalation_warning?: {
    level: 'low' | 'medium' | 'high';
    message: string;
  };
}

/**
 * Send audio for voice chat - returns transcript, AI response, and audio
 */
export async function sendVoiceMessage(
  audioBlob: Blob,
  conversationId?: string
): Promise<VoiceChatResponse> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  if (conversationId) {
    formData.append('conversation_id', conversationId);
  }

  const response = await api.post<ApiResponse<VoiceChatResponse>>('/voice/chat', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to process voice message');
  }
  return response.data.data;
}

/**
 * Transcribe audio to text only
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const response = await api.post<ApiResponse<{ text: string }>>('/voice/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error?.message || 'Failed to transcribe audio');
  }
  return response.data.data.text;
}

/**
 * Convert text to speech - returns audio blob
 */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  const response = await api.post('/voice/synthesize', { text }, {
    responseType: 'blob',
  });
  return response.data;
}

export default api;

