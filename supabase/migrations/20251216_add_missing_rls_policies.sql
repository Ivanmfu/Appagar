-- Migration: Add RLS policies for expenses, expense_participants, settlements, and activity_events
-- Date: 2025-12-16
-- Purpose: Fix critical security issue - these tables were missing RLS policies

-- ============================================================================
-- EXPENSES TABLE
-- ============================================================================

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expenses'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.expenses;', policy_record.policyname);
  END LOOP;
END
$$;

-- Members can view expenses in their groups
CREATE POLICY "Members can view group expenses"
  ON public.expenses
  FOR SELECT
  USING (public.is_group_member(group_id));

-- Members can create expenses in their groups
CREATE POLICY "Members can create group expenses"
  ON public.expenses
  FOR INSERT
  WITH CHECK (public.is_group_member(group_id));

-- Expense creator or group owner can update
CREATE POLICY "Creator or owner can update expenses"
  ON public.expenses
  FOR UPDATE
  USING (created_by = auth.uid() OR public.is_group_owner(group_id))
  WITH CHECK (created_by = auth.uid() OR public.is_group_owner(group_id));

-- Expense creator or group owner can delete
CREATE POLICY "Creator or owner can delete expenses"
  ON public.expenses
  FOR DELETE
  USING (created_by = auth.uid() OR public.is_group_owner(group_id));

-- ============================================================================
-- EXPENSE_PARTICIPANTS TABLE
-- ============================================================================

ALTER TABLE public.expense_participants ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expense_participants'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.expense_participants;', policy_record.policyname);
  END LOOP;
END
$$;

-- Helper to check if user can access expense via group membership
CREATE OR REPLACE FUNCTION public.can_access_expense(expense_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expense_group_id uuid;
BEGIN
  -- Disable RLS to avoid recursion
  PERFORM set_config('row_security', 'off', true);
  
  SELECT group_id INTO expense_group_id
  FROM public.expenses
  WHERE id = expense_uuid;
  
  IF expense_group_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN public.is_group_member(expense_group_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_expense(uuid) TO anon, authenticated, service_role;

-- Members can view participants of expenses in their groups
CREATE POLICY "Members can view expense participants"
  ON public.expense_participants
  FOR SELECT
  USING (public.can_access_expense(expense_id));

-- Members can add participants to expenses in their groups
CREATE POLICY "Members can add expense participants"
  ON public.expense_participants
  FOR INSERT
  WITH CHECK (public.can_access_expense(expense_id));

-- Members can update participants of expenses in their groups
CREATE POLICY "Members can update expense participants"
  ON public.expense_participants
  FOR UPDATE
  USING (public.can_access_expense(expense_id))
  WITH CHECK (public.can_access_expense(expense_id));

-- Members can delete participants from expenses in their groups
CREATE POLICY "Members can delete expense participants"
  ON public.expense_participants
  FOR DELETE
  USING (public.can_access_expense(expense_id));

-- ============================================================================
-- SETTLEMENTS TABLE
-- ============================================================================

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'settlements'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.settlements;', policy_record.policyname);
  END LOOP;
END
$$;

-- Members can view settlements in their groups
CREATE POLICY "Members can view group settlements"
  ON public.settlements
  FOR SELECT
  USING (group_id IS NULL OR public.is_group_member(group_id));

-- Involved parties can create settlements
CREATE POLICY "Involved parties can create settlements"
  ON public.settlements
  FOR INSERT
  WITH CHECK (
    (group_id IS NULL OR public.is_group_member(group_id))
    AND (from_user_id = auth.uid() OR to_user_id = auth.uid())
  );

-- Settlements are immutable - no updates allowed
-- (If you need to fix a settlement, delete and recreate)

-- Only involved parties or group owner can delete settlements
CREATE POLICY "Involved parties or owner can delete settlements"
  ON public.settlements
  FOR DELETE
  USING (
    from_user_id = auth.uid() 
    OR to_user_id = auth.uid() 
    OR (group_id IS NOT NULL AND public.is_group_owner(group_id))
  );

-- ============================================================================
-- ACTIVITY_EVENTS TABLE
-- ============================================================================

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_events'
  )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_events;', policy_record.policyname);
  END LOOP;
END
$$;

-- Members can view activity in their groups, or their own activity
CREATE POLICY "Members can view group activity"
  ON public.activity_events
  FOR SELECT
  USING (
    actor_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_group_member(group_id))
  );

-- Authenticated users can insert their own activity
CREATE POLICY "Users can log own activity"
  ON public.activity_events
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Activity events are immutable - no updates
-- Activity events are immutable - no deletes (audit trail)

COMMENT ON POLICY "Members can view group expenses" ON public.expenses IS 'Group members can read all expenses in their groups';
COMMENT ON POLICY "Members can view expense participants" ON public.expense_participants IS 'Group members can see who participated in expenses';
COMMENT ON POLICY "Members can view group settlements" ON public.settlements IS 'Group members can see all settlements in their groups';
COMMENT ON POLICY "Members can view group activity" ON public.activity_events IS 'Group members can see activity feed for their groups';
