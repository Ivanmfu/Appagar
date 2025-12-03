-- Ensure row level security is enforced for finance tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts') THEN
    ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.accounts FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Accounts select requires owner" ON public.accounts;
    CREATE POLICY "Accounts select requires owner" ON public.accounts
      FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Accounts insert requires owner" ON public.accounts;
    CREATE POLICY "Accounts insert requires owner" ON public.accounts
      FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Accounts update requires owner" ON public.accounts;
    CREATE POLICY "Accounts update requires owner" ON public.accounts
      FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Accounts delete requires owner" ON public.accounts;
    CREATE POLICY "Accounts delete requires owner" ON public.accounts
      FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = user_id);
  ELSE
    RAISE NOTICE 'Skipping account policies: table public.accounts not found';
  END IF;
END $$;

-- Budgets policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budgets') THEN
    ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.budgets FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Budgets select requires owner" ON public.budgets;
    CREATE POLICY "Budgets select requires owner" ON public.budgets
      FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Budgets insert requires owner" ON public.budgets;
    CREATE POLICY "Budgets insert requires owner" ON public.budgets
      FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Budgets update requires owner" ON public.budgets;
    CREATE POLICY "Budgets update requires owner" ON public.budgets
      FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Budgets delete requires owner" ON public.budgets;
    CREATE POLICY "Budgets delete requires owner" ON public.budgets
      FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = user_id);
  ELSE
    RAISE NOTICE 'Skipping budget policies: table public.budgets not found';
  END IF;
END $$;

-- Transactions policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'transactions') THEN
    ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Transactions select requires owner" ON public.transactions;
    CREATE POLICY "Transactions select requires owner" ON public.transactions
      FOR SELECT USING (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Transactions insert requires owner" ON public.transactions;
    CREATE POLICY "Transactions insert requires owner" ON public.transactions
      FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Transactions update requires owner" ON public.transactions;
    CREATE POLICY "Transactions update requires owner" ON public.transactions
      FOR UPDATE USING (auth.role() = 'authenticated' AND auth.uid() = user_id)
      WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id);

    DROP POLICY IF EXISTS "Transactions delete requires owner" ON public.transactions;
    CREATE POLICY "Transactions delete requires owner" ON public.transactions
      FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = user_id);
  ELSE
    RAISE NOTICE 'Skipping transaction policies: table public.transactions not found';
  END IF;
END $$;
