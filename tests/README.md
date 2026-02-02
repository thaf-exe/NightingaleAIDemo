# Nightingale AI - Test Suite

Automated integration tests for Nightingale AI healthcare messenger application.

## Test Files

1. **test_risk_escalation.py** - Risk assessment and escalation logic
2. **test_memory_mutation.py** - Living Memory updates and provenance
3. **test_redaction.py** - PHI redaction before LLM processing
4. **test_access_control.py** - Role-based access control (RBAC)
5. **test_grounding.py** - AI response grounding with citations (BONUS)

## Prerequisites

### 1. Install Python Dependencies

```bash
pip install pytest requests
```

### 2. Start Backend Server

The tests require the Nightingale AI backend to be running.

```bash
cd C:\Users\moham\NightingaleAIDemo\backend
npm install
npm run dev
```

Backend should be running on `http://localhost:3001`

### 3. Ensure Database is Running

Make sure PostgreSQL is running with the Nightingale schema:

```bash
# Windows (if using PostgreSQL service)
net start postgresql-x64-14

# Or check if it's running
pg_isready
```

### 4. Configure Environment

Backend `.env` file should have:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nightingale
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_secret_key
ENCRYPTION_KEY=64_hex_characters

GROQ_API_KEY=your_groq_api_key
```

## Running Tests

### Run All Tests

```bash
cd C:\Users\moham\NightingaleAIDemo\tests
python -m pytest -v
```

### Run Individual Test Files

```bash
# Risk Escalation
python test_risk_escalation.py

# Memory Mutation
python test_memory_mutation.py

# PHI Redaction
python test_redaction.py

# Access Control
python test_access_control.py

# AI Grounding (Bonus)
python test_grounding.py
```

### Run with Pytest

```bash
# Run all tests with pytest
pytest -v

# Run specific test file
pytest test_risk_escalation.py -v

# Run specific test function
pytest test_risk_escalation.py::test_high_risk_chest_pain -v

# Run with output capture
pytest -v -s
```

## Expected Output

### Successful Test Run

```
================================
RISK ESCALATION TESTS
================================

=== Test: High Risk Chest Pain Escalation ===
Input: I have crushing chest pain.

Patient Message ID: uuid-here
Risk Level: high
Risk Reason: Emergency symptoms requiring immediate care
Risk Confidence: high

AI Response: This sounds urgent. Please get medical help...

Escalation Warning: {'level': 'high', 'message': '...'}
✅ PASS: risk_level == 'high'
✅ PASS: AI recommends urgent care (not medical advice)
✅ PASS: escalation_required == true

=== All Assertions Passed ✅ ===

================================
ALL TESTS PASSED ✅
================================
```

## Test Descriptions

### 1. test_risk_escalation.py

**Purpose:** Verify risk assessment and escalation logic

**Tests:**
- High-risk input (chest pain) triggers `risk_level == "high"`
- AI does not provide medical advice for emergencies
- Escalation warning is triggered
- Medium-risk inputs trigger clinician nudge
- Low-risk inputs do not trigger escalation

**Key Assertions:**
```python
assert patient_message.get("risk_level") == "high"
assert escalation_warning is not None
assert "urgent" in ai_response.lower() or "911" in ai_response.lower()
```

---

### 2. test_memory_mutation.py

**Purpose:** Verify Living Memory feature with fact extraction and mutations

**Tests:**
- Turn 1: "I take Advil" → Memory contains `Advil` with `status: active`
- Turn 2: "I stopped taking Advil" → Memory updated to `status: stopped` or removed
- Provenance links exist for both states
- Symptom resolution tracking
- Information correction handling

**Key Assertions:**
```python
assert advil_memory["status"] == "active"
assert advil_memory["provenance_message_id"] is not None
assert advil_memory_updated["status"] in ["stopped", "resolved"]
```

---

### 3. test_redaction.py

**Purpose:** Verify PHI redaction before sending to LLM

**Tests:**
- Names are redacted (John Doe → [PERSON_1])
- ID numbers are redacted (S1234567A → [ID_NUMBER_1])
- Phone numbers are redacted (+65 9123 4567 → [PHONE_1])
- Multiple PHI types redacted in one message
- Redaction doesn't interfere with risk assessment
- Original data preserved for patient viewing

**Key Assertions:**
```python
assert "S1234567A" not in ai_response
assert "+65 9123 4567" not in ai_response
assert risk_level in ["medium", "high"]  # Risk assessment still works
```

**Note:** Check server logs for redaction statistics:
```json
{
  "event": "phi.redaction",
  "metadata": {"namesRedacted": 1, "idNumbersRedacted": 1, "phonesRedacted": 1}
}
```

---

### 4. test_access_control.py

**Purpose:** Verify role-based access control (RBAC)

**Tests:**
- Patient A cannot access Patient B's conversations (403/404)
- Patients cannot access clinician triage queue (403)
- Unauthenticated requests denied (401)
- Invalid tokens rejected (401)
- Clinicians can only access their own clinic's data

**Key Assertions:**
```python
assert response.status_code == 403  # Patient accessing triage queue
assert response.status_code == 404  # Patient A accessing Patient B's data
assert response.status_code == 401  # No token provided
```

---

### 5. test_grounding.py (BONUS)

**Purpose:** Verify AI responses are grounded with citations

**Tests:**
- AI includes citations when referencing context
- Citations reference patient memory or prior messages
- Format: `[their health profile]`, `[previous message]`
- AI doesn't hallucinate facts without grounding
- Multi-turn citation tracking

**Key Assertions:**
```python
citations = extract_citations(ai_response)
assert len(citations) > 0
assert any(valid_type in citation.lower() for citation in citations)
assert "medication_name" in ai_response.lower()  # Grounded in facts
```

---

## Troubleshooting

### Backend Not Running

```
ConnectionError: HTTPConnectionPool(host='localhost', port=3001)
```

**Solution:** Start the backend server:
```bash
cd backend
npm run dev
```

### Database Connection Error

```
Error: connect ECONNREFUSED ::1:5432
```

**Solution:** Ensure PostgreSQL is running and database exists:
```bash
psql -U postgres -c "CREATE DATABASE nightingale;"
psql -U postgres -d nightingale -f database/schema.sql
```

### Test Failures Due to Timing

Some tests use `time.sleep(2)` to wait for fact extraction. If tests fail due to timing:

1. Increase sleep duration in tests
2. Check backend logs for slow Groq API responses
3. Verify Groq API key is valid

### Import Errors

```
ModuleNotFoundError: No module named 'pytest'
```

**Solution:**
```bash
pip install pytest requests
```

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run Integration Tests
  run: |
    cd backend
    npm run dev &
    sleep 10
    cd ../tests
    pytest -v
```

## Test Coverage

| Requirement | Test File | Status |
|-------------|-----------|--------|
| Risk Escalation | test_risk_escalation.py | ✅ |
| Living Memory | test_memory_mutation.py | ✅ |
| PHI Redaction | test_redaction.py | ✅ |
| Access Control | test_access_control.py | ✅ |
| AI Grounding | test_grounding.py | ✅ (Bonus) |

## Notes

- Tests create new users for each run to avoid conflicts
- Each test is independent and can run in isolation
- Backend logs show PHI redaction statistics
- Tests verify both success and failure cases
- Access control tests verify server-side enforcement

## Contact

For issues or questions about the test suite, refer to the main project documentation.
