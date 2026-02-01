/**
 * Authentication Service
 * 
 * JWT (JSON Web Token) EXPLAINED:
 * 
 * A JWT has 3 parts separated by dots: HEADER.PAYLOAD.SIGNATURE
 * 
 * HEADER: Algorithm used (e.g., HS256)
 * PAYLOAD: Data we want to store (userId, role, expiry)
 * SIGNATURE: Cryptographic proof that WE created this token
 * 
 * The signature is created using our secret key.
 * If anyone tampers with the payload, the signature won't match.
 * This is how we know the token is authentic and unchanged.
 * 
 * FLOW:
 * 1. User sends username + password
 * 2. We verify password against hash in database
 * 3. If correct, we create a JWT with user info
 * 4. We send JWT to client
 * 5. Client sends JWT with every request (in Authorization header)
 * 6. We verify JWT signature before processing request
 */

import jwt from 'jsonwebtoken';
import { User, UserPublic, AuthResponse, LoginRequest } from '../types';
import { findUserByUsername, findUserById } from '../models';
import { verifyPassword, sha256Hash } from '../utils';
import { query } from '../models/db';
import { v4 as uuidv4 } from 'uuid';

// Get JWT configuration from environment
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-not-for-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * What we store in the JWT payload
 */
interface JwtPayload {
  userId: string;
  username: string;
  role: string;
  clinicId: string | null;
  iat?: number; // Issued at (added by jwt library)
  exp?: number; // Expiration (added by jwt library)
}

/**
 * Login a user
 * @returns AuthResponse with token, or null if credentials invalid
 */
export async function login(
  credentials: LoginRequest,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthResponse | null> {
  // 1. Find user by username
  const user = await findUserByUsername(credentials.username);
  if (!user) {
    return null; // User not found
  }
  
  // 2. Verify password
  const isPasswordValid = await verifyPassword(credentials.password, user.password_hash);
  if (!isPasswordValid) {
    return null; // Wrong password
  }
  
  // 3. Create JWT payload
  const payload: JwtPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    clinicId: user.clinic_id,
  };
  
  // 4. Sign the token
  // expiresIn can be a string like '24h' or number of seconds
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
  
  // 5. Calculate expiration date
  const decoded = jwt.decode(token) as JwtPayload;
  const expiresAt = new Date((decoded.exp || 0) * 1000);
  
  // 6. Store session in database (for logout/revocation)
  await createSession(user.id, token, expiresAt, ipAddress, userAgent);
  
  // 7. Return public user info + token
  return {
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      date_of_birth: user.date_of_birth,
      gender: user.gender,
      clinic_id: user.clinic_id,
      created_at: user.created_at,
    },
    token,
    expiresAt,
  };
}

/**
 * Verify a JWT token
 * @returns Decoded payload if valid, null if invalid
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return payload;
  } catch (error) {
    // Token is invalid or expired
    return null;
  }
}

/**
 * Check if a session is valid (not revoked)
 */
export async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = sha256Hash(token);
  const sql = `
    SELECT 1 FROM sessions 
    WHERE token_hash = $1 
    AND revoked_at IS NULL 
    AND expires_at > CURRENT_TIMESTAMP
  `;
  const result = await query(sql, [tokenHash]);
  return result.rowCount > 0;
}

/**
 * Create a new session
 */
async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const sql = `
    INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  await query(sql, [
    uuidv4(),
    userId,
    sha256Hash(token), // Store hash, not actual token
    expiresAt,
    ipAddress || null,
    userAgent || null,
  ]);
}

/**
 * Revoke a session (logout)
 */
export async function revokeSession(token: string): Promise<boolean> {
  const tokenHash = sha256Hash(token);
  const sql = `
    UPDATE sessions 
    SET revoked_at = CURRENT_TIMESTAMP 
    WHERE token_hash = $1 AND revoked_at IS NULL
  `;
  const result = await query(sql, [tokenHash]);
  return result.rowCount > 0;
}

/**
 * Revoke all sessions for a user (e.g., password change)
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const sql = `
    UPDATE sessions 
    SET revoked_at = CURRENT_TIMESTAMP 
    WHERE user_id = $1 AND revoked_at IS NULL
  `;
  await query(sql, [userId]);
}

/**
 * Get user from token (for middleware)
 */
export async function getUserFromToken(token: string): Promise<UserPublic | null> {
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }
  
  // Verify session is still valid
  const sessionValid = await isSessionValid(token);
  if (!sessionValid) {
    return null;
  }
  
  // Get user from database
  return findUserById(payload.userId);
}
