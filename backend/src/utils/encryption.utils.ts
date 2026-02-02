/**
 * Encryption Utilities
 * 
 * HIPAA requires encryption for PHI (Protected Health Information).
 * We encrypt message content before storing in database.
 * 
 * ALGORITHM: AES-256-GCM
 * - AES = Advanced Encryption Standard (industry standard)
 * - 256 = 256-bit key (very secure)
 * - GCM = Galois/Counter Mode (provides authenticity AND encryption)
 * 
 * GCM is special because it:
 * 1. Encrypts the data (confidentiality)
 * 2. Creates an authentication tag (integrity)
 * 3. Detects if data was tampered with
 */

import crypto from 'crypto';

// Algorithm to use
const ALGORITHM = 'aes-256-gcm';

// IV (Initialization Vector) length - 12 bytes is recommended for GCM
const IV_LENGTH = 12;

// Authentication tag length
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * Key must be 32 bytes (256 bits) = 64 hex characters
 */
function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt text data
 * 
 * @param plaintext - Data to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  
  // Generate random IV for each encryption
  // CRITICAL: Never reuse IVs with the same key!
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the data
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Get authentication tag
  const authTag = cipher.getAuthTag();
  
  // Combine: iv:authTag:ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt text data
 * 
 * @param encryptedData - Data in format iv:authTag:ciphertext (or plain text for legacy)
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: string): string {
  // Handle null/undefined
  if (!encryptedData) {
    return '';
  }

  // Check if data is in our encrypted format (iv:authTag:ciphertext)
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    // Not encrypted with our format - return as-is (legacy data)
    // This handles old unencrypted messages in the database
    console.warn('Decrypting legacy unencrypted data');
    return encryptedData;
  }
  
  try {
    const key = getKey();
    
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = parts[2];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    // Set auth tag for verification
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // If decryption fails, it might be legacy plain text that happens to have colons
    console.warn('Decryption failed, returning as plain text:', error);
    return encryptedData;
  }
}

export default { encrypt, decrypt };
