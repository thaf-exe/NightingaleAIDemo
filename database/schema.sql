-- Nightingale AI Database Schema
-- Version: 1.0.0
-- 
-- IMPORTANT: This schema is designed with healthcare compliance in mind:
-- - Audit logs contain NO PHI (only hashed identifiers)
-- - Voice transcript fields ready for future audio integration
-- - Proper constraints and indexes for performance

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CLINICS TABLE
-- Clinicians are scoped to clinics for access control
-- ============================================
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default clinic for testing
INSERT INTO clinics (id, name, address) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Demo Clinic', '123 Healthcare Ave, Medical City, MC 12345')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- USERS TABLE
-- Stores both patients and clinicians
-- Role determines access (RBAC)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'clinician')),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    clinic_id UUID REFERENCES clinics(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster login queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
-- Index for finding clinicians by clinic
CREATE INDEX IF NOT EXISTS idx_users_clinic ON users(clinic_id) WHERE role = 'clinician';

-- ============================================
-- SESSIONS TABLE
-- Tracks active JWT sessions for security
-- Allows invalidating sessions on logout
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL, -- We store hash, not actual token
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE, -- Set when user logs out
    user_agent TEXT,
    ip_address VARCHAR(45) -- IPv6 max length
);

-- Index for token validation
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash) WHERE revoked_at IS NULL;
-- Index for finding user sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============================================
-- AUDIT_LOGS TABLE
-- PHI-FREE audit trail for compliance
-- All identifiers are hashed!
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(50) NOT NULL,
    user_id_hash VARCHAR(64), -- SHA-256 hash of user ID
    ip_address_hash VARCHAR(64), -- SHA-256 hash of IP
    user_agent_hash VARCHAR(64), -- SHA-256 hash of user agent
    resource_type VARCHAR(50) NOT NULL,
    resource_id_hash VARCHAR(64), -- SHA-256 hash of resource ID
    action_result VARCHAR(20) NOT NULL CHECK (action_result IN ('success', 'failure', 'denied')),
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb -- PHI-free additional context
);

-- Index for querying by event type and time
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type, timestamp);
-- Index for querying by user (hashed)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id_hash);

-- ============================================
-- CONVERSATIONS TABLE (for future chat feature)
-- Voice-ready with transcript fields
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_patient ON conversations(patient_id);

-- ============================================
-- MESSAGES TABLE (for future chat feature)
-- Voice-ready with audio fields
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('patient', 'ai', 'clinician')),
    sender_id UUID REFERENCES users(id), -- NULL for AI messages
    content_encrypted TEXT NOT NULL, -- Encrypted message content
    
    -- Risk assessment (AI calculates for each patient message)
    risk_level VARCHAR(10) CHECK (risk_level IN ('low', 'medium', 'high')),
    risk_reason TEXT,
    risk_confidence VARCHAR(10) CHECK (risk_confidence IN ('low', 'medium', 'high')),
    risk_assessed_at TIMESTAMP WITH TIME ZONE,
    
    -- AI response metadata
    ai_confidence VARCHAR(10) CHECK (ai_confidence IN ('low', 'medium', 'high')),
    ai_citations JSONB, -- References to source material
    
    -- Voice readiness fields
    audio_id VARCHAR(255), -- Reference to audio storage
    audio_transcript TEXT, -- Transcription of audio
    audio_duration_seconds INTEGER,
    is_voice_message BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ============================================
-- PATIENT_MEMORY TABLE (Living Memory feature)
-- Stores extracted facts from conversations
-- ============================================
CREATE TABLE IF NOT EXISTS patient_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL, -- 'chief_complaint', 'symptom', 'medication', 'allergy', etc.
    value TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'resolved', 'corrected')),
    timeline TEXT, -- e.g., "started 2 weeks ago"
    provenance_message_id UUID REFERENCES messages(id), -- Links to source message
    provenance_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patient_memory_patient ON patient_memory(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_memory_type ON patient_memory(patient_id, memory_type);

-- ============================================
-- ESCALATIONS TABLE (Clinic Escalation Loop)
-- When AI escalates to human clinician
-- ============================================
CREATE TABLE IF NOT EXISTS escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    assigned_clinician_id UUID REFERENCES users(id),
    
    -- Trigger information
    triggering_message_id UUID REFERENCES messages(id),
    trigger_reason TEXT NOT NULL,
    
    -- Triage summary (1-5 bullets)
    triage_summary JSONB NOT NULL,
    
    -- Profile snapshot at time of escalation
    profile_snapshot JSONB NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'in_progress', 'resolved')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    
    -- Resolution
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escalations_clinic ON escalations(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_escalations_clinician ON escalations(assigned_clinician_id) WHERE assigned_clinician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_escalations_patient ON escalations(patient_id);

-- ============================================
-- FUNCTION: Update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
DO $$ 
BEGIN
    -- Users
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Clinics
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_clinics_updated_at') THEN
        CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Conversations
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversations_updated_at') THEN
        CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Patient Memory
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_patient_memory_updated_at') THEN
        CREATE TRIGGER update_patient_memory_updated_at BEFORE UPDATE ON patient_memory
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Escalations
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_escalations_updated_at') THEN
        CREATE TRIGGER update_escalations_updated_at BEFORE UPDATE ON escalations
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE 'Nightingale AI database schema created successfully!';
END $$;
