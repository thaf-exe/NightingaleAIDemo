-- ============================================
-- CLEAR ALL DATA FROM NIGHTINGALE DATABASE
-- ============================================
-- WARNING: This will delete ALL data while preserving schema
-- Only the default demo clinic will remain

-- Disable triggers temporarily to avoid cascading issues
SET session_replication_role = replica;

-- Clear all tables in reverse dependency order
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE escalations CASCADE;
TRUNCATE TABLE patient_memory CASCADE;
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversations CASCADE;
TRUNCATE TABLE sessions CASCADE;
TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE clinics CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Re-insert default demo clinic
INSERT INTO clinics (id, name, address) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Demo Clinic', '123 Healthcare Ave, Medical City, MC 12345')
ON CONFLICT (id) DO NOTHING;

-- Success message
DO $$ 
BEGIN
    RAISE NOTICE '✅ Database cleared successfully! All data has been removed.';
    RAISE NOTICE 'Demo clinic has been re-created.';
END $$;
