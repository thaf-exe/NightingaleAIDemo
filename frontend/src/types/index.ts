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
