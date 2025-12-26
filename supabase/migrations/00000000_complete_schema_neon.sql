-- ============================================================================
-- MIGRATION: Complete Schema for Neon PostgreSQL
-- This consolidates all migrations for a fresh Neon database
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS TABLE (replaces Supabase auth + profiles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT,
  image TEXT,
  email_verified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================================
-- GROUPS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'EUR',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  group_type TEXT,
  start_date DATE,
  end_date DATE,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);

-- ============================================================================
-- GROUP MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  fx_rate NUMERIC(10,6) NOT NULL DEFAULT 1,
  amount_base_minor INTEGER NOT NULL,
  category TEXT,
  note TEXT,
  date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group_id ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_payer_id ON expenses(payer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- ============================================================================
-- EXPENSE PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_minor INTEGER NOT NULL,
  is_included BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_participants_expense_id ON expense_participants(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_participants_user_id ON expense_participants(user_id);

-- ============================================================================
-- SETTLEMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settlements_group_id ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX IF NOT EXISTS idx_settlements_to_user ON settlements(to_user_id);

-- ============================================================================
-- GROUP INVITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  receiver_email TEXT,
  receiver_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_group_invites_group_id ON group_invites(group_id);
CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_email ON group_invites(email);

-- ============================================================================
-- ACTIVITY EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_group_id ON activity_events(group_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_actor_id ON activity_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);

-- ============================================================================
-- FRIEND INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS friend_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- ============================================================================
-- AUTH.JS TABLES (for OAuth providers)
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

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ============================================================================
-- GROUP BALANCE VIEW (computed balances)
-- ============================================================================

CREATE OR REPLACE VIEW group_balance AS
SELECT 
  e.group_id,
  ep.user_id,
  COALESCE(SUM(
    CASE WHEN e.payer_id = ep.user_id 
         THEN e.amount_base_minor - ep.share_minor 
         ELSE -ep.share_minor 
    END
  ), 0) AS net_minor
FROM expense_participants ep
JOIN expenses e ON e.id = ep.expense_id
GROUP BY e.group_id, ep.user_id;
