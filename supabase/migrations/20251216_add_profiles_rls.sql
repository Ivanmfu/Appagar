-- Migration: Add RLS policies for profiles table
-- Date: 2025-12-16
-- Purpose: Fix critical security issue - profiles table needs proper RLS
-- This resolves the workaround in AuthGate.tsx

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles;', policy_record.policyname);
  END LOOP;
END
$$;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Users can read profiles of members in their groups (for display names)
CREATE POLICY "Users can read group member profiles"
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.group_members gm1
      INNER JOIN public.group_members gm2 ON gm1.group_id = gm2.group_id
      WHERE gm1.user_id = auth.uid()
        AND gm1.is_active = true
        AND gm2.user_id = profiles.id
        AND gm2.is_active = true
    )
  );

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Users cannot delete profiles (soft delete or never delete)
-- No DELETE policy = no one can delete

COMMENT ON POLICY "Users can read own profile" ON public.profiles IS 'Users can always read their own profile data';
COMMENT ON POLICY "Users can read group member profiles" ON public.profiles IS 'Users can see display names of people they share groups with';
COMMENT ON POLICY "Users can insert own profile" ON public.profiles IS 'Users can create their own profile on first login';
COMMENT ON POLICY "Users can update own profile" ON public.profiles IS 'Users can modify their own display name and email';
