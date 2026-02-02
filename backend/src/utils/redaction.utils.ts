/**
 * PHI Redaction Utilities
 * 
 * CRITICAL: Before sending ANY text to external LLM APIs (Groq),
 * we MUST redact Protected Health Information (PHI):
 * - Names (first, last, full names)
 * - Identification numbers (NRIC, passport, ID cards)
 * - Phone numbers
 * 
 * This is required for:
 * 1. HIPAA compliance (US healthcare privacy law)
 * 2. PDPA compliance (Singapore Personal Data Protection Act)
 * 3. General privacy best practices
 * 
 * HOW IT WORKS:
 * - Uses regex patterns to detect PHI
 * - Replaces with semantic placeholders: [PERSON], [ID_NUMBER], [PHONE]
 * - After LLM response, restores original values if needed
 */

/**
 * Redaction mapping to restore original values
 */
export interface RedactionMap {
  names: Map<string, string>;      // [PERSON_1] -> "John Doe"
  idNumbers: Map<string, string>;  // [ID_NUMBER_1] -> "S1234567A"
  phones: Map<string, string>;     // [PHONE_1] -> "+65 9123 4567"
}

/**
 * Result of redaction operation
 */
export interface RedactionResult {
  redactedText: string;
  map: RedactionMap;
  hadPhi: boolean;
}

// Regex patterns for PHI detection

// Phone number patterns (international, with/without formatting)
const PHONE_PATTERNS = [
  /\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{1,4}[\s.-]?\d{1,9}/g,  // International: +1 (555) 123-4567
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,                          // US: 555-123-4567
  /\b\d{4}[\s]?\d{4}\b/g,                                        // Singapore: 9123 4567
  /\b[689]\d{7}\b/g,                                             // Singapore mobile: 91234567
];

// ID number patterns
const ID_PATTERNS = [
  /\b[STFG]\d{7}[A-Z]\b/gi,                                      // Singapore NRIC: S1234567A
  /\b[A-Z]\d{8}\b/gi,                                            // Passport: A12345678
  /\b\d{3}-\d{2}-\d{4}\b/g,                                      // US SSN: 123-45-6789
  /\bIC\s*:?\s*\d{6}-\d{2}-\d{4}\b/gi,                          // Malaysia IC: IC: 123456-12-1234
];

// Common name patterns (simple heuristic - capitalized words, 2-4 words)
// This is imperfect but catches most common names
const NAME_PATTERN = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}\b/g;

/**
 * Redact PHI from text before sending to LLM
 * 
 * @param text - Original text that may contain PHI
 * @param knownNames - Optional array of known names to definitely redact (e.g., patient name)
 * @returns Redacted text with mapping to restore original values
 */
export function redactPhi(text: string, knownNames: string[] = []): RedactionResult {
  if (!text || text.trim().length === 0) {
    return {
      redactedText: text,
      map: { names: new Map(), idNumbers: new Map(), phones: new Map() },
      hadPhi: false,
    };
  }

  let redacted = text;
  const map: RedactionMap = {
    names: new Map(),
    idNumbers: new Map(),
    phones: new Map(),
  };
  let hadPhi = false;

  // 1. Redact known names first (highest priority)
  knownNames.forEach((name, index) => {
    if (name && name.trim().length > 0) {
      // Create case-insensitive regex for the full name
      const nameRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const placeholder = `[PERSON_${index + 1}]`;
      
      if (nameRegex.test(redacted)) {
        redacted = redacted.replace(nameRegex, placeholder);
        map.names.set(placeholder, name);
        hadPhi = true;
      }
    }
  });

  // 2. Redact ID numbers (NRIC, passport, SSN, etc.)
  let idCounter = 1;
  ID_PATTERNS.forEach(pattern => {
    const matches = redacted.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const placeholder = `[ID_NUMBER_${idCounter}]`;
        redacted = redacted.replace(match, placeholder);
        map.idNumbers.set(placeholder, match);
        idCounter++;
        hadPhi = true;
      });
    }
  });

  // 3. Redact phone numbers
  let phoneCounter = 1;
  PHONE_PATTERNS.forEach(pattern => {
    const matches = redacted.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // Filter out false positives (e.g., dates, times)
        // Phone numbers should have at least 7 digits
        const digitCount = (match.match(/\d/g) || []).length;
        if (digitCount >= 7) {
          const placeholder = `[PHONE_${phoneCounter}]`;
          redacted = redacted.replace(match, placeholder);
          map.phones.set(placeholder, match);
          phoneCounter++;
          hadPhi = true;
        }
      });
    }
  });

  // 4. Redact potential names (capitalized words)
  // Skip if already redacted as known names
  const potentialNames = text.match(NAME_PATTERN) || [];
  let nameCounter = knownNames.length + 1;
  
  potentialNames.forEach(name => {
    // Skip common words that aren't names
    const skipWords = ['Patient', 'Doctor', 'Nurse', 'Clinician', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 
                       'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
                       'Nightingale', 'Clinic', 'Hospital', 'Health', 'Medical'];
    
    if (skipWords.includes(name)) return;
    
    // Only redact if still present (not already redacted)
    if (redacted.includes(name)) {
      const placeholder = `[PERSON_${nameCounter}]`;
      const nameRegex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      redacted = redacted.replace(nameRegex, placeholder);
      map.names.set(placeholder, name);
      nameCounter++;
      hadPhi = true;
    }
  });

  return {
    redactedText: redacted,
    map,
    hadPhi,
  };
}

/**
 * Restore PHI in text after receiving LLM response
 * 
 * @param text - Text with placeholders from LLM
 * @param map - Mapping of placeholders to original values
 * @returns Text with original PHI restored
 */
export function restorePhi(text: string, map: RedactionMap): string {
  if (!text) return text;
  
  let restored = text;
  
  // Restore names
  map.names.forEach((original, placeholder) => {
    restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
  });
  
  // Restore ID numbers
  map.idNumbers.forEach((original, placeholder) => {
    restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
  });
  
  // Restore phone numbers
  map.phones.forEach((original, placeholder) => {
    restored = restored.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), original);
  });
  
  return restored;
}

/**
 * Get redaction statistics for audit logging
 */
export function getRedactionStats(map: RedactionMap): {
  namesRedacted: number;
  idNumbersRedacted: number;
  phonesRedacted: number;
  totalRedactions: number;
} {
  return {
    namesRedacted: map.names.size,
    idNumbersRedacted: map.idNumbers.size,
    phonesRedacted: map.phones.size,
    totalRedactions: map.names.size + map.idNumbers.size + map.phones.size,
  };
}

export default {
  redactPhi,
  restorePhi,
  getRedactionStats,
};
