-- Reset group-related policies to resolve recursive RLS issues

-- Drop existing policies on group_members to prevent recursion
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_members'
  )
  LOOP
    EXECUTE format('drop policy if exists %I on public.group_members;', policy_record.policyname);
  END LOOP;
END
$$;

-- Drop existing policies on groups to ensure a clean slate
DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'groups'
  )
  LOOP
    EXECUTE format('drop policy if exists %I on public.groups;', policy_record.policyname);
  END LOOP;
END
$$;

-- Helper function to determine if current user belongs to a group
CREATE OR REPLACE FUNCTION public.is_group_member(group_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_member_id uuid;
BEGIN
  current_member_id := auth.uid();
  IF current_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = group_uuid
      AND gm.user_id = current_member_id
      AND COALESCE(gm.is_active, TRUE)
  );
END;
$$;

COMMENT ON FUNCTION public.is_group_member(uuid) IS 'Checks whether the authenticated user is an active member of the given group.';

-- Helper function to determine if current user owns a group
CREATE OR REPLACE FUNCTION public.is_group_owner(group_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_member_id uuid;
BEGIN
  current_member_id := auth.uid();
  IF current_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = group_uuid
      AND g.created_by = current_member_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = group_uuid
      AND gm.user_id = current_member_id
      AND gm.role = 'owner'
      AND COALESCE(gm.is_active, TRUE)
  );
END;
$$;

COMMENT ON FUNCTION public.is_group_owner(uuid) IS 'Checks whether the authenticated user owns the given group.';

-- Ensure authenticated contexts can execute helper functions
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid) TO anon, authenticated, service_role;

-- Re-enable row level security safeguards
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Policies for group_members
CREATE POLICY "Group members can read membership"
  ON public.group_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_group_member(group_id)
  );

CREATE POLICY "Users can join groups themselves"
  ON public.group_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members manage their own membership"
  ON public.group_members
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners or members can leave"
  ON public.group_members
  FOR DELETE
  USING (
    auth.uid() = user_id
    OR public.is_group_owner(group_id)
  );

-- Policies for groups
CREATE POLICY "Members can view groups"
  ON public.groups
  FOR SELECT
  USING (
    public.is_group_member(id)
    OR public.is_group_owner(id)
    OR auth.uid() = created_by
  );

CREATE POLICY "Creators can insert groups"
  ON public.groups
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update groups"
  ON public.groups
  FOR UPDATE
  USING (public.is_group_owner(id) OR auth.uid() = created_by)
  WITH CHECK (public.is_group_owner(id) OR auth.uid() = created_by);

CREATE POLICY "Owners can delete groups"
  ON public.groups
  FOR DELETE
  USING (public.is_group_owner(id) OR auth.uid() = created_by);
