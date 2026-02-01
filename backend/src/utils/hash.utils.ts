/**
 * Hashing Utilities
 * 
 * We use TWO types of hashing:
 * 
 * 1. PASSWORD HASHING (bcrypt)
 *    - Slow by design (prevents brute force)
 *    - Includes "salt" (random data) so same password = different hash
 *    - Used ONLY for passwords
 * 
 * 2. GENERAL HASHING (SHA-256)
 *    - Fast
 *    - Same input = same output (deterministic)
 *    - Used for audit logs (hashing user IDs, IPs, etc.)
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Number of salt rounds for bcrypt (higher = slower but more secure)
// 12 is a good balance for production
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password (safe to store in database)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password from user
 * @param hash - Hash from database
 * @returns true if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a SHA-256 hash (for audit logs, non-password data)
 * @param data - String to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256Hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a cryptographically secure random string
 * @param length - Number of bytes (result will be 2x this in hex)
 * @returns Random hex string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}
