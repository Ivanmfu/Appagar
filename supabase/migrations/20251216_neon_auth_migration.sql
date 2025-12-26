-- Migration: Setup tables for Neon + Auth.js migration
-- This replaces Supabase auth with Auth.js and adapts the schema
-- Date: 2025-12-16

-- ============================================================================
-- USERS TABLE (replaces profiles + Supabase auth.users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT, -- For credentials login, NULL for OAuth users
  display_name TEXT,
  image TEXT,
  email_verified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- MIGRATE EXISTING PROFILES TO USERS
-- ============================================================================

-- Copy data from profiles to users (if profiles table exists)
INSERT INTO users (id, email, display_name, created_at)
SELECT id, email, display_name, COALESCE(created_at, NOW())
FROM profiles
WHERE email IS NOT NULL
ON CONFLICT (email) DO UPDATE SET
  display_name = COALESCE(EXCLUDED.display_name, users.display_name),
  updated_at = NOW();

-- ============================================================================
-- UPDATE FOREIGN KEYS TO REFERENCE USERS
-- ============================================================================

-- groups.created_by -> users
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_created_by_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- group_members.user_id -> users
ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_user_id_fkey;
ALTER TABLE group_members ADD CONSTRAINT group_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- expenses.payer_id -> users
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payer_id_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_payer_id_fkey
  FOREIGN KEY (payer_id) REFERENCES users(id) ON DELETE CASCADE;

-- expenses.created_by -> users
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- expense_participants.user_id -> users
ALTER TABLE expense_participants DROP CONSTRAINT IF EXISTS expense_participants_user_id_fkey;
ALTER TABLE expense_participants ADD CONSTRAINT expense_participants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- settlements.from_user_id -> users
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_from_user_id_fkey;
ALTER TABLE settlements ADD CONSTRAINT settlements_from_user_id_fkey
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- settlements.to_user_id -> users
ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_to_user_id_fkey;
ALTER TABLE settlements ADD CONSTRAINT settlements_to_user_id_fkey
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE;

-- activity_events.actor_id -> users
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS activity_events_actor_id_fkey;
ALTER TABLE activity_events ADD CONSTRAINT activity_events_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

-- group_invites.created_by -> users
ALTER TABLE group_invites DROP CONSTRAINT IF EXISTS group_invites_created_by_fkey;
ALTER TABLE group_invites ADD CONSTRAINT group_invites_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;

-- group_invites.sender_id -> users
ALTER TABLE group_invites DROP CONSTRAINT IF EXISTS group_invites_sender_id_fkey;
ALTER TABLE group_invites ADD CONSTRAINT group_invites_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL;

-- group_invites.receiver_id -> users
ALTER TABLE group_invites DROP CONSTRAINT IF EXISTS group_invites_receiver_id_fkey;
ALTER TABLE group_invites ADD CONSTRAINT group_invites_receiver_id_fkey
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- ACCOUNTS TABLE (for Auth.js OAuth providers)
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);

-- ============================================================================
-- SESSIONS TABLE (optional, for database sessions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- ============================================================================
-- VERIFICATION TOKENS (for email verification)
-- ============================================================================

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ============================================================================
-- PERFORMANCE INDEXES (from audit recommendations)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expense_participants_expense_id ON expense_participants(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_participants_user_id ON expense_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_user ON settlements(to_user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_group_id ON activity_events(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor_id ON activity_events(actor_id);

COMMENT ON TABLE users IS 'User accounts, replaces Supabase auth.users + profiles';
COMMENT ON TABLE accounts IS 'OAuth provider accounts linked to users (Auth.js)';
COMMENT ON TABLE sessions IS 'Active user sessions (Auth.js)';
