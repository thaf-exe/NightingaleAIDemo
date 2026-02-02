# Nightingale AI - Healthcare Messenger Platform

A HIPAA-ready healthcare messaging platform with AI-powered triage, living memory, and clinic escalation loops.

## Features

- 🤖 **AI Patient Intake** - Conversational interface with risk assessment
- 🧠 **Living Memory** - Automatic fact extraction with mutation tracking
- 🚨 **Clinic Escalation Loop** - High-risk cases routed to clinicians with ground truth override
- 🔒 **PHI Redaction** - Automatic removal of names, IDs, and phone numbers before LLM calls
- 🛡️ **RBAC Enforcement** - Multi-layer access control (routes, middleware, database)
- 🎤 **Voice Ready** - Database schema includes audio transcript fields
- 📋 **Audit Logging** - PHI-free structured JSON logs

---

## Setup Instructions

### Prerequisites

- **Node.js** v18+ and npm
- **PostgreSQL** 14+
- **Python** 3.8+ (for tests)
- **Groq API Key** (for LLM inference)

### 1. Clone Repository

```bash
git clone https://github.com/thaf-exe/NightingaleAIDemo.git
cd NightingaleAIDemo
```

### 2. Database Setup

```bash
# Start PostgreSQL (Windows)
net start postgresql-x64-14

# Create database
psql -U postgres -c "CREATE DATABASE nightingale;"

# Run schema
psql -U postgres -d nightingale -f database/schema.sql
```

### 3. Backend Setup

```bash
cd backend
npm install

# Create .env file
cp .env.example .env
```

Edit `backend/.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nightingale
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your-secret-key-min-32-chars
GROQ_API_KEY=your_groq_api_key

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=64_hex_characters
```

### 4. Frontend Setup

```bash
cd frontend
npm install
```

---

## Running the Application

### Start Backend (Terminal 1)

```bash
cd backend
npm run dev
```

Backend runs on `http://localhost:3001`

### Start Frontend (Terminal 2)

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

### Access Application

Open `http://localhost:5173` in your browser.

**Demo Accounts:**
- Patient: Register via `/register` with role `patient`
- Clinician: Register via `/register` with role `clinician`

---

## Running Tests

### Install Test Dependencies

```bash
pip install pytest requests
```

### Run All Tests

```bash
cd tests
python -m pytest -v
```

### Run Individual Test Suites

```bash
# Risk Escalation
python test_risk_escalation.py

# PHI Redaction
python test_redaction.py

# Access Control (RBAC)
python test_access_control.py

# AI Grounding (Citations)
python test_grounding.py
```

### Test Coverage

| Requirement | Test File | Status |
|-------------|-----------|--------|
| Risk Escalation | `test_risk_escalation.py` | ✅ |
| Living Memory | `test_memory_mutation.py` | ✅ |
| PHI Redaction | `test_redaction.py` | ✅ |
| Access Control | `test_access_control.py` | ✅ |
| AI Grounding | `test_grounding.py` | ✅ |

**Note:** Backend must be running at `http://localhost:3001` for tests to execute.

---

## PHI Redaction Pipeline

### Where Redaction Happens

**Location:** [`backend/src/services/groq.service.ts`](backend/src/services/groq.service.ts#L100-L165)

**When:** Before every LLM API call (Groq)

**What Gets Redacted:**
1. **Names** → `[PERSON_1]`, `[PERSON_2]`
2. **ID Numbers** (NRIC/SSN/Passport) → `[ID_NUMBER_1]`
3. **Phone Numbers** → `[PHONE_1]`

### Redaction Flow

```
Patient Message → redactPhi() → [REDACTED] → Groq LLM → AI Response → restorePhi() → Patient Sees Original
```

### Implementation Details

**Redaction Logic:** [`backend/src/utils/redaction.utils.ts`](backend/src/utils/redaction.utils.ts)

```typescript
// Before LLM call
const { redactedText, map } = redactPhi(userMessage, knownNames);

// Send to LLM
const aiResponse = await groq.chat.completions.create({
  messages: [{ role: 'user', content: redactedText }]
});

// Restore PHI in response
const restoredContent = restorePhi(aiResponse.content, map);
```

**Regex Patterns:**
- **Singapore NRIC:** `S/T/F/G + 7 digits + letter`
- **US SSN:** `123-45-6789`
- **International Phones:** `+country code + digits`

**Audit Trail:**
```json
{
  "event": "phi.redaction",
  "metadata": {
    "namesRedacted": 2,
    "idNumbersRedacted": 1,
    "phonesRedacted": 1
  }
}
```

**Key Files:**
- Redaction utilities: [`backend/src/utils/redaction.utils.ts`](backend/src/utils/redaction.utils.ts)
- Groq service integration: [`backend/src/services/groq.service.ts`](backend/src/services/groq.service.ts#L100-L165)
- Structured logging: [`backend/src/utils/logger.utils.ts`](backend/src/utils/logger.utils.ts)

---

## RBAC Enforcement

### 3-Layer Access Control

#### Layer 1: Frontend Route Guards

**Location:** [`frontend/src/App.tsx`](frontend/src/App.tsx)

```tsx
// Patient-only routes
<Route path="/chat" element={
  <ProtectedRoute allowedRoles={['patient']}>
    <ChatPage />
  </ProtectedRoute>
} />

// Clinician-only routes
<Route path="/triage" element={
  <ProtectedRoute allowedRoles={['clinician']}>
    <TriagePage />
  </ProtectedRoute>
} />
```

#### Layer 2: Backend Middleware

**Location:** [`backend/src/middleware/auth.middleware.ts`](backend/src/middleware/auth.middleware.ts)

```typescript
// JWT verification
export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, JWT_SECRET);
  req.user = decoded;
  next();
}

// Role-based restriction
export function requireRole(allowedRoles: string[]) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

**Applied to Routes:**
```typescript
// Patient endpoints
router.post('/chat/message', requireAuth, requireRole(['patient']), handler);

// Clinician endpoints
router.get('/escalations/queue', requireAuth, requireRole(['clinician']), handler);
```

#### Layer 3: Database-Level Filtering

**Location:** [`backend/src/models/`](backend/src/models/)

```typescript
// Conversations filtered by patient_id
async function getPatientConversations(userId: string) {
  return query(
    `SELECT * FROM conversations WHERE patient_id = $1`,
    [userId]
  );
}

// Escalations filtered by clinic_id
async function getClinicEscalations(clinicId: string) {
  return query(
    `SELECT * FROM escalations WHERE clinic_id = $1`,
    [clinicId]
  );
}
```

### Enforcement Points

| Resource | Frontend | Middleware | Database |
|----------|----------|------------|----------|
| Chat Messages | ✅ Route guard | ✅ `requireRole(['patient'])` | ✅ `WHERE patient_id = $userId` |
| Triage Queue | ✅ Route guard | ✅ `requireRole(['clinician'])` | ✅ `WHERE clinic_id = $clinicId` |
| Patient Memory | ✅ Route guard | ✅ `requireAuth` | ✅ `WHERE user_id = $userId` |
| Escalations | ✅ Route guard | ✅ `requireRole(['clinician'])` | ✅ `WHERE clinic_id = $clinicId` |

### Testing RBAC

See [`tests/test_access_control.py`](tests/test_access_control.py) for validation:
- ❌ Patient A cannot access Patient B's conversations (403/404)
- ❌ Patients cannot access triage queue (403)
- ❌ Unauthenticated requests denied (401)
- ✅ Clinicians can only access their clinic's data

---

## Project Structure

### Backend (`backend/`)

| Folder | Purpose |
|--------|---------|
| `routes/` | API endpoints (REST API handlers) |
| `middleware/` | Auth, role checks, request logging |
| `services/` | Business logic (Groq AI, risk assessment) |
| `models/` | Database queries (PostgreSQL) |
| `types/` | TypeScript interfaces |
| `utils/` | PHI redaction, encryption, logging |

### Frontend (`frontend/`)

| Folder | Purpose |
|--------|---------|
| `src/pages/` | React components for each route |
| `src/components/` | Reusable UI components |
| `src/context/` | Auth context (user session) |
| `src/services/` | API client (axios) |

### Database (`database/`)

| File | Purpose |
|------|---------|
| `schema.sql` | Full database schema with triggers |
| `clear_data.sql` | Wipe all data (preserves schema) |

### Tests (`tests/`)

| File | Purpose |
|------|---------|
| `test_risk_escalation.py` | High/medium/low risk handling |
| `test_memory_mutation.py` | Living Memory updates |
| `test_redaction.py` | PHI removal before LLM |
| `test_access_control.py` | RBAC enforcement |
| `test_grounding.py` | Citation validation |
| `README.md` | Test suite documentation |

---

## Key Technologies

- **Backend:** Node.js, Express, TypeScript, PostgreSQL
- **Frontend:** React, TypeScript, Vite
- **AI:** Groq (Llama 3.3-70b-versatile)
- **Voice:** Groq Whisper (STT), Google TTS
- **Security:** JWT, AES-256-GCM encryption, SHA-256 hashing
- **Testing:** Python, pytest, requests

---

## Documentation

- **Audit Logging:** [`docs/AUDIT_LOGGING.md`](docs/AUDIT_LOGGING.md)
- **Test Suite:** [`tests/README.md`](tests/README.md)

---

## Clearing Database

To wipe all data and start fresh:

```bash
cd database
psql -U postgres -d nightingale -f clear_data.sql
```

This removes all users, conversations, and memory while preserving the schema.

---

## License

Proprietary - Demo Project
