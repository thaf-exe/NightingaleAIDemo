/**
 * User Model
 * 
 * This file handles all database operations for users.
 * Models are the ONLY place we write SQL queries.
 * 
 * WHY PARAMETERIZED QUERIES ($1, $2, etc.)?
 * - Prevents SQL injection attacks
 * - Never concatenate user input into SQL strings!
 * - Example of WRONG: `SELECT * FROM users WHERE username = '${username}'`
 * - Example of RIGHT: `SELECT * FROM users WHERE username = $1`, [username]
 */

import { query } from './db';
import { User, UserPublic, RegisterRequest, UserRole } from '../types';
import { hashPassword } from '../utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Convert database row to UserPublic (removes password_hash)
 */
function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    first_name: user.first_name,
    last_name: user.last_name,
    date_of_birth: user.date_of_birth,
    gender: user.gender,
    clinic_id: user.clinic_id,
    created_at: user.created_at,
  };
}

/**
 * Create a new user
 */
export async function createUser(data: RegisterRequest): Promise<UserPublic> {
  const id = uuidv4();
  const passwordHash = await hashPassword(data.password);
  
  const sql = `
    INSERT INTO users (
      id, username, password_hash, role, 
      first_name, last_name, date_of_birth, gender, clinic_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  
  const params = [
    id,
    data.username.toLowerCase(), // Normalize username to lowercase
    passwordHash,
    data.role,
    data.first_name,
    data.last_name,
    data.date_of_birth,
    data.gender,
    data.clinic_id || null,
  ];
  
  const result = await query<User>(sql, params);
  return toUserPublic(result.rows[0]);
}

/**
 * Find user by username (includes password_hash for login verification)
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const sql = 'SELECT * FROM users WHERE username = $1 AND is_active = true';
  const result = await query<User>(sql, [username.toLowerCase()]);
  return result.rows[0] || null;
}

/**
 * Find user by ID (public info only)
 */
export async function findUserById(id: string): Promise<UserPublic | null> {
  const sql = 'SELECT * FROM users WHERE id = $1 AND is_active = true';
  const result = await query<User>(sql, [id]);
  return result.rows[0] ? toUserPublic(result.rows[0]) : null;
}

/**
 * Check if username exists
 */
export async function usernameExists(username: string): Promise<boolean> {
  const sql = 'SELECT 1 FROM users WHERE username = $1';
  const result = await query(sql, [username.toLowerCase()]);
  return result.rowCount > 0;
}

/**
 * Get all users by role (for admin purposes)
 */
export async function getUsersByRole(role: UserRole): Promise<UserPublic[]> {
  const sql = 'SELECT * FROM users WHERE role = $1 AND is_active = true ORDER BY created_at DESC';
  const result = await query<User>(sql, [role]);
  return result.rows.map(toUserPublic);
}

/**
 * Get clinicians by clinic ID (for RBAC - clinicians can only see their clinic's data)
 */
export async function getCliniciansByClinic(clinicId: string): Promise<UserPublic[]> {
  const sql = `
    SELECT * FROM users 
    WHERE role = 'clinician' AND clinic_id = $1 AND is_active = true 
    ORDER BY last_name, first_name
  `;
  const result = await query<User>(sql, [clinicId]);
  return result.rows.map(toUserPublic);
}

/**
 * Deactivate a user (soft delete)
 */
export async function deactivateUser(id: string): Promise<boolean> {
  const sql = 'UPDATE users SET is_active = false WHERE id = $1';
  const result = await query(sql, [id]);
  return result.rowCount > 0;
}

/**
 * Get user with password hash (for internal auth use only)
 */
export async function getUserWithPassword(username: string): Promise<User | null> {
  return findUserByUsername(username);
}
