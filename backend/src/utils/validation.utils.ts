/**
 * Input Validation Utilities
 * 
 * NEVER trust user input! Always validate on the server.
 * Even if frontend validates, attackers can bypass it.
 */

import { RegisterRequest, UserRole, Gender } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validate username
 * - 3-30 characters
 * - Alphanumeric and underscores only
 * - No spaces
 */
export function validateUsername(username: string): ValidationError | null {
  if (!username || username.length < 3) {
    return { field: 'username', message: 'Username must be at least 3 characters' };
  }
  if (username.length > 30) {
    return { field: 'username', message: 'Username must be at most 30 characters' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { field: 'username', message: 'Username can only contain letters, numbers, and underscores' };
  }
  return null;
}

/**
 * Validate password strength
 * Healthcare apps need strong passwords!
 * - At least 8 characters
 * - At least one uppercase
 * - At least one lowercase
 * - At least one number
 * - At least one special character
 */
export function validatePassword(password: string): ValidationError | null {
  if (!password || password.length < 8) {
    return { field: 'password', message: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { field: 'password', message: 'Password must be at most 128 characters' };
  }
  if (!/[A-Z]/.test(password)) {
    return { field: 'password', message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { field: 'password', message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { field: 'password', message: 'Password must contain at least one number' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { field: 'password', message: 'Password must contain at least one special character' };
  }
  return null;
}

/**
 * Validate name (first or last)
 */
export function validateName(name: string, field: string): ValidationError | null {
  if (!name || name.trim().length < 1) {
    return { field, message: `${field} is required` };
  }
  if (name.length > 50) {
    return { field, message: `${field} must be at most 50 characters` };
  }
  // Allow letters, spaces, hyphens, and apostrophes (for names like O'Brien)
  if (!/^[a-zA-Z\s\-']+$/.test(name)) {
    return { field, message: `${field} contains invalid characters` };
  }
  return null;
}

/**
 * Validate date of birth
 * - Must be a valid date
 * - Must be in the past
 * - Must be reasonable (not more than 150 years ago)
 */
export function validateDateOfBirth(dateStr: string): ValidationError | null {
  if (!dateStr) {
    return { field: 'date_of_birth', message: 'Date of birth is required' };
  }
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return { field: 'date_of_birth', message: 'Invalid date format' };
  }
  
  const now = new Date();
  if (date >= now) {
    return { field: 'date_of_birth', message: 'Date of birth must be in the past' };
  }
  
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 150);
  if (date < minDate) {
    return { field: 'date_of_birth', message: 'Invalid date of birth' };
  }
  
  return null;
}

/**
 * Validate role
 */
export function validateRole(role: string): ValidationError | null {
  const validRoles: UserRole[] = ['patient', 'clinician'];
  if (!validRoles.includes(role as UserRole)) {
    return { field: 'role', message: 'Role must be either "patient" or "clinician"' };
  }
  return null;
}

/**
 * Validate gender
 */
export function validateGender(gender: string): ValidationError | null {
  const validGenders: Gender[] = ['male', 'female', 'other', 'prefer_not_to_say'];
  if (!validGenders.includes(gender as Gender)) {
    return { field: 'gender', message: 'Invalid gender value' };
  }
  return null;
}

/**
 * Validate complete registration request
 */
export function validateRegistration(data: Partial<RegisterRequest>): ValidationResult {
  const errors: ValidationError[] = [];
  
  // Check each field
  const usernameError = validateUsername(data.username || '');
  if (usernameError) errors.push(usernameError);
  
  const passwordError = validatePassword(data.password || '');
  if (passwordError) errors.push(passwordError);
  
  const roleError = validateRole(data.role || '');
  if (roleError) errors.push(roleError);
  
  const firstNameError = validateName(data.first_name || '', 'first_name');
  if (firstNameError) errors.push(firstNameError);
  
  const lastNameError = validateName(data.last_name || '', 'last_name');
  if (lastNameError) errors.push(lastNameError);
  
  const dobError = validateDateOfBirth(data.date_of_birth || '');
  if (dobError) errors.push(dobError);
  
  const genderError = validateGender(data.gender || '');
  if (genderError) errors.push(genderError);
  
  // Clinicians must have a clinic_id (we'll enforce this once clinics exist)
  // For now, we'll make it optional and handle in the route
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
