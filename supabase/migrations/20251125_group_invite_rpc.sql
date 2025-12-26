DO $$
DECLARE
  v_has_tables boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'group_invites'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'group_members'
  )
  INTO v_has_tables;

  IF NOT v_has_tables THEN
    RAISE NOTICE 'Skipping respond_group_invite creation: group_invites or group_members missing';
    RETURN;
  END IF;

  -- Use dynamic SQL so parsing succeeds even when running migrations on databases
  -- that temporarily lack the referenced composite types.
  EXECUTE 'DROP FUNCTION IF EXISTS public.respond_group_invite(uuid, text)';

  EXECUTE $$
    CREATE OR REPLACE FUNCTION public.respond_group_invite(
      p_invite_id uuid,
      p_action text
    )
    RETURNS public.group_invites
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS '
    DECLARE
      v_sub text;
      v_invite public.group_invites%rowtype;
      v_member public.group_members%rowtype;
      v_user_id uuid;
    BEGIN
      v_sub := current_setting(''request.jwt.claim.sub'', true);
      IF v_sub IS NULL OR v_sub = '''' OR v_sub !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' THEN
        RAISE EXCEPTION ''Authentication required'';
      END IF;

      v_user_id := v_sub::uuid;

      IF p_action NOT IN (''accept'', ''decline'') THEN
        RAISE EXCEPTION ''Invalid invite action: %'', p_action;
      END IF;

      SELECT * INTO v_invite
      FROM public.group_invites
      WHERE id = p_invite_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION ''Invite not found'';
      END IF;

      IF v_invite.receiver_id IS NOT NULL AND v_invite.receiver_id <> v_user_id THEN
        RAISE EXCEPTION ''Invite belongs to another user'';
      END IF;

      IF v_invite.status <> ''pending'' THEN
        RAISE EXCEPTION ''Invite is no longer pending'';
      END IF;

      IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= timezone(''utc'', now()) THEN
        RAISE EXCEPTION ''Invite expired'';
      END IF;

      IF p_action = ''accept'' THEN
        SELECT *
        INTO v_member
        FROM public.group_members
        WHERE group_id = v_invite.group_id
          AND user_id = v_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
          INSERT INTO public.group_members (group_id, user_id, is_active)
          VALUES (v_invite.group_id, v_user_id, true)
          ON CONFLICT (group_id, user_id)
            DO UPDATE SET is_active = true
          RETURNING * INTO v_member;
        ELSIF coalesce(v_member.is_active, true) = false THEN
          UPDATE public.group_members
          SET is_active = true
          WHERE group_id = v_invite.group_id
            AND user_id = v_user_id
          RETURNING * INTO v_member;
        END IF;

        UPDATE public.group_invites
        SET status = ''accepted'', receiver_id = v_user_id
        WHERE id = p_invite_id
        RETURNING * INTO v_invite;
      ELSE
        UPDATE public.group_invites
        SET status = ''declined'', receiver_id = v_user_id
        WHERE id = p_invite_id
        RETURNING * INTO v_invite;
      END IF;

      RETURN v_invite;
    END;
    '';
  $$;

  COMMENT ON FUNCTION public.respond_group_invite(uuid, text)
    IS 'Handles accepting or declining a group invite atomically with membership adjustments.';

  GRANT EXECUTE ON FUNCTION public.respond_group_invite(uuid, text) TO authenticated;
END $$;
