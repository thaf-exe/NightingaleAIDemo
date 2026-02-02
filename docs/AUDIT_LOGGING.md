# Audit Logging Guidelines

## CRITICAL: PHI-Free Logging Policy

All logs in this application MUST be PHI-free for HIPAA/PDPA compliance.

### ✅ WHAT TO LOG

1. **Event Types**
   - `auth.login`, `auth.logout`, `auth.register`
   - `escalation.create`, `escalation.reply`, `escalation.resolve`
   - `access.denied`, `access.unauthorized`
   - `resource.create`, `resource.read`, `resource.update`, `resource.delete`

2. **Hashed Identifiers**
   - User ID → SHA-256 hash
   - IP Address → SHA-256 hash
   - Resource ID → SHA-256 hash
   - User Agent → SHA-256 hash

3. **Aggregated Statistics**
   - Number of facts extracted
   - Risk level (low/medium/high)
   - Number of PHI items redacted
   - Response times, error codes

4. **Timestamps**
   - ISO 8601 format: `2026-02-02T14:30:00.000Z`

5. **Metadata (PHI-free)**
   - Priority levels
   - Status codes
   - Resource types
   - Error codes (not messages)

### ❌ NEVER LOG

1. **Patient Data**
   - Full names
   - Date of birth
   - Email addresses
   - Phone numbers
   - Address information

2. **Message Content**
   - Patient messages
   - AI responses
   - Clinician replies
   - Conversation transcripts

3. **Medical Information**
   - Symptoms
   - Diagnoses
   - Medications
   - Medical history

4. **Sensitive Identifiers**
   - Unhashed user IDs
   - Session tokens (plain)
   - NRIC/passport numbers
   - Credit card info

## Implementation

### Database Audit Logs

Location: `backend/src/models/audit.model.ts`

All audit logs stored in `audit_logs` table with:
- Hashed identifiers (SHA-256)
- JSONB metadata (structured, queryable)
- Event types (enumerated)
- Timestamps (automatic)

Example:
```typescript
await createAuditLog({
  event_type: 'escalation.create',
  user_id: userId,  // Will be hashed
  resource_type: 'escalation',
  resource_id: escalationId,  // Will be hashed
  action_result: 'success',
  metadata: { 
    priority: 'high',
    conversation_id: conversationId  // ID only, no content
  },
});
```

### Structured Application Logs

Location: `backend/src/utils/logger.utils.ts`

For runtime errors/warnings that don't fit audit logs:

```typescript
import { logError, createRequestContext } from '../utils/logger.utils';

// ✅ CORRECT: PHI-free structured logging
logError(
  'chat.processing_error',
  'Failed to process chat message',
  error,
  createRequestContext(requestId, userId, 'message', messageId, ipAddress),
  { risk_level: 'medium', facts_extracted: 3 }
);

// ❌ WRONG: May contain PHI
console.error('Error processing message:', messageContent, error);
```

### Output Format

All structured logs output as JSON:

```json
{
  "timestamp": "2026-02-02T14:30:00.000Z",
  "level": "ERROR",
  "event": "chat.processing_error",
  "message": "Failed to process chat message",
  "context": {
    "requestId": "uuid-here",
    "userIdHash": "sha256-hash-here",
    "resourceType": "message",
    "resourceIdHash": "sha256-hash-here",
    "ipAddressHash": "sha256-hash-here"
  },
  "metadata": {
    "risk_level": "medium",
    "facts_extracted": 3
  },
  "error": {
    "type": "ValidationError",
    "code": "INVALID_INPUT"
  }
}
```

## Querying Audit Logs

### Find all login attempts
```sql
SELECT * FROM audit_logs 
WHERE event_type = 'auth.login' 
ORDER BY timestamp DESC;
```

### Find failed access attempts
```sql
SELECT * FROM audit_logs 
WHERE action_result = 'denied' 
AND timestamp > NOW() - INTERVAL '24 hours';
```

### Find events for specific user (requires hash)
```sql
SELECT * FROM audit_logs 
WHERE user_id_hash = encode(digest('user-uuid', 'sha256'), 'hex')
ORDER BY timestamp DESC;
```

## Compliance Notes

1. **Audit Retention**: Logs kept for 7 years (HIPAA requirement)
2. **Access Control**: Only admins can query audit logs
3. **Immutability**: Audit logs cannot be modified/deleted
4. **Encryption**: Database encrypted at rest (AES-256)
5. **PHI Verification**: Regular audits to ensure no PHI in logs

## Code Review Checklist

Before merging any code, verify:
- [ ] No `console.log()` with user data
- [ ] All IDs hashed before logging
- [ ] No message content in logs
- [ ] Structured logging used for errors
- [ ] Audit events created for actions
- [ ] Metadata is PHI-free
