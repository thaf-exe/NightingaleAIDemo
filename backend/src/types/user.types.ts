/**
 * User roles for RBAC (Role-Based Access Control)
 * 
 * RBAC EXPLAINED:
 * - Each user has a ROLE (patient or clinician)
 * - Each role has PERMISSIONS (what they can do)
 * - Server checks role BEFORE allowing any action
 * - This prevents patients from seeing clinician queue
 */
export type UserRole = 'patient' | 'clinician';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

/**
 * User stored in database
 * Note: password_hash, not password! We NEVER store plain passwords.
 */
export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string; // ISO date string
  gender: Gender;
  clinic_id: string | null; // Clinicians belong to a clinic
  created_at: Date;
  updated_at: Date;
}

/**
 * What we send to frontend (NO password hash!)
 * This is called a "DTO" - Data Transfer Object
 */
export interface UserPublic {
  id: string;
  username: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender;
  clinic_id: string | null;
  created_at: Date;
}

/**
 * Registration request from frontend
 */
export interface RegisterRequest {
  username: string;
  password: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: Gender;
  clinic_id?: string; // Optional, only for clinicians
}

/**
 * Login request
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * What we return after successful auth
 */
export interface AuthResponse {
  user: UserPublic;
  token: string; // JWT token
  expiresAt: Date;
}
