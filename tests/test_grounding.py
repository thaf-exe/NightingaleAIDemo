"""
Test: AI Response Grounding (BONUS)

Requirement: AI outputs include citations that resolve to a span

Assert:
- Any AI output includes at least one citation
- Citations reference either:
  - [their health profile] (from patient memory)
  - [previous message] (from conversation history)
  - [their earlier statement] (contextual reference)
"""

import pytest
import requests
import json
import re
from typing import Dict, Any, List

# Backend API base URL
API_BASE_URL = "http://localhost:3001/api"

def setup_test_patient() -> Dict[str, Any]:
    """Register and login a test patient"""
    import time
    timestamp = int(time.time()) % 100000000  # Last 8 digits
    register_data = {
        "username": f"gnd_pt_{timestamp}",
        "password": "TestPassword123!",
        "role": "patient",
        "first_name": "Grounding",
        "last_name": "Testuser",
        "date_of_birth": "1990-01-01",
        "gender": "other",
        "clinic_id": "00000000-0000-0000-0000-000000000001"
    }
    
    response = requests.post(f"{API_BASE_URL}/auth/register", json=register_data)
    assert response.status_code == 201, f"Registration failed: {response.text}"
    
    data = response.json()
    return {
        "token": data["data"]["token"],
        "user": data["data"]["user"]
    }

def send_message(token: str, message: str, conversation_id: str = None) -> Dict[str, Any]:
    """Send a chat message and return response"""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"content": message}
    
    if conversation_id:
        payload["conversation_id"] = conversation_id
    
    response = requests.post(
        f"{API_BASE_URL}/chat/message",
        json=payload,
        headers=headers
    )
    
    assert response.status_code == 200, f"Message failed: {response.text}"
    return response.json()["data"]

def extract_citations(text: str) -> List[str]:
    """Extract citations from AI response text"""
    # Pattern: [citation text]
    pattern = r'\[([^\]]+)\]'
    matches = re.findall(pattern, text)
    return matches

def get_patient_memory(token: str) -> List[Dict[str, Any]]:
    """Get patient's living memory"""
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{API_BASE_URL}/chat/memory",
        headers=headers
    )
    
    assert response.status_code == 200, f"Get memory failed: {response.text}"
    return response.json()["data"]

def test_citation_in_context_aware_response():
    """Test that AI includes citations when referencing patient context"""
    print("\n=== Test: Citation in Context-Aware Response ===")
    
    # Setup
    patient = setup_test_patient()
    token = patient["token"]
    conversation_id = None
    
    # Turn 1: Establish context (patient taking medication)
    print("\n--- Turn 1: Establishing Context ---")
    turn1_input = "I take Aspirin daily for my heart."
    print(f"Input: {turn1_input}")
    
    turn1_response = send_message(token, turn1_input, conversation_id)
    conversation_id = turn1_response["conversation_id"]
    
    # Wait for memory extraction
    import time
    time.sleep(2)
    
    # Turn 2: Ask about the medication
    print("\n--- Turn 2: Asking About Medication ---")
    turn2_input = "When did I start taking Aspirin?"
    print(f"Input: {turn2_input}")
    
    turn2_response = send_message(token, turn2_input, conversation_id)
    ai_response = turn2_response["ai_message"]["content"]
    
    print(f"\nAI Response: {ai_response}")
    
    # Extract citations from response
    citations = extract_citations(ai_response)
    print(f"\nCitations found: {citations}")
    
    # ASSERTION 1: Response should contain at least one citation
    assert len(citations) > 0, \
        f"AI response should include citations. Found {len(citations)}"
    print(f"✅ PASS: Found {len(citations)} citation(s)")
    
    # ASSERTION 2: Citations should reference relevant sources
    valid_citation_types = [
        "their health profile",
        "your health profile",
        "their previous message",
        "previous message",
        "earlier statement",
        "what you told me",
        "you mentioned",
        "their profile",
        "your profile"
    ]
    
    has_valid_citation = False
    for citation in citations:
        citation_lower = citation.lower()
        if any(valid_type in citation_lower for valid_type in valid_citation_types):
            has_valid_citation = True
            print(f"✅ PASS: Valid citation found: [{citation}]")
            break
    
    assert has_valid_citation, \
        f"Citations should reference valid sources. Found: {citations}"
    
    # ASSERTION 3: AI response should reference the medication by name
    assert "aspirin" in ai_response.lower(), \
        "AI should reference the specific medication mentioned"
    print("✅ PASS: AI correctly referenced the medication from context")
    
    print("\n=== All Assertions Passed ✅ ===\n")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("AI GROUNDING TESTS (BONUS)")
    print("="*60)
    
    try:
        test_citation_in_context_aware_response()
        
        
        print("\n" + "="*60)
        print("TEST PASSED ✅")
        print("="*60 + "\n")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n❌ ERROR: {e}\n")
        raise
