-- Enforce non-null and non-negative amounts on transactions and guard account balances

-- Ensure transaction.amount is always present and positive according to the entry type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transactions'
        AND column_name = 'amount'
    ) THEN
      ALTER TABLE public.transactions
        ALTER COLUMN amount SET NOT NULL;

      -- Align amount sign expectations with the transaction type when available
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'transactions'
          AND column_name = 'type'
      ) THEN
        ALTER TABLE public.transactions
          DROP CONSTRAINT IF EXISTS transactions_amount_non_negative;
        ALTER TABLE public.transactions
          ADD CONSTRAINT transactions_amount_non_negative
          CHECK (
            CASE
              WHEN type IN ('expense', 'withdrawal', 'transfer_out', 'debit') THEN amount > 0
              WHEN type IN ('income', 'deposit', 'transfer_in', 'credit') THEN amount >= 0
              ELSE amount >= 0
            END
          ) NOT VALID;
        ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_amount_non_negative;
      ELSE
        ALTER TABLE public.transactions
          DROP CONSTRAINT IF EXISTS transactions_amount_non_negative;
        ALTER TABLE public.transactions
          ADD CONSTRAINT transactions_amount_non_negative
          CHECK (amount >= 0) NOT VALID;
        ALTER TABLE public.transactions VALIDATE CONSTRAINT transactions_amount_non_negative;
      END IF;
    ELSE
      RAISE NOTICE 'Skipping transaction amount constraint: column transactions.amount not found';
    END IF;
  ELSE
    RAISE NOTICE 'Skipping transaction amount constraint: table public.transactions not found';
  END IF;
END $$;

-- Trigger to prevent account balances from dropping below zero (when accounts and transaction metadata exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'account_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'type'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'amount'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'id'
  ) THEN

    CREATE OR REPLACE FUNCTION public.assert_account_balance_non_negative()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = public
    AS $$
    DECLARE
      target_account uuid;
      base_balance numeric;
      projected_balance numeric;
      delta numeric := 0;

      -- Helper to convert a transaction row into a signed delta
      FUNCTION signed_amount(t_type text, t_amount numeric) RETURNS numeric AS $$
      BEGIN
        IF t_type IN ('expense', 'withdrawal', 'transfer_out', 'debit') THEN
          RETURN -abs(t_amount);
        ELSE
          RETURN abs(t_amount);
        END IF;
      END;
      $$ LANGUAGE plpgsql;
    BEGIN
      -- Validate the balance for the account being debited (OLD) when applicable
      IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.account_id IS NOT NULL THEN
        SELECT COALESCE(SUM(signed_amount(t.type, t.amount)), 0)
        INTO base_balance
        FROM public.transactions t
        WHERE t.account_id = OLD.account_id
          AND t.id <> OLD.id;

        IF base_balance < 0 THEN
          RAISE EXCEPTION 'El saldo no puede quedar en negativo para esta cuenta.' USING ERRCODE = 'P0001';
        END IF;
      END IF;

      -- Validate the account that will receive the new/updated transaction
      IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.account_id IS NOT NULL THEN
        SELECT COALESCE(SUM(signed_amount(t.type, t.amount)), 0)
        INTO projected_balance
        FROM public.transactions t
        WHERE t.account_id = NEW.account_id
          AND (TG_OP = 'INSERT' OR t.id <> NEW.id);

        delta := signed_amount(NEW.type, NEW.amount);
        projected_balance := projected_balance + delta;

        IF projected_balance < 0 THEN
          RAISE EXCEPTION 'El saldo no puede quedar en negativo para esta cuenta.' USING ERRCODE = 'P0001';
        END IF;
      END IF;

      RETURN COALESCE(NEW, OLD);
    END;
    $$;

    DROP TRIGGER IF EXISTS ensure_account_balance_non_negative ON public.transactions;
    CREATE TRIGGER ensure_account_balance_non_negative
      BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
      FOR EACH ROW
      EXECUTE FUNCTION public.assert_account_balance_non_negative();
  ELSE
    RAISE NOTICE 'Skipping balance trigger: transactions.account_id/type/amount/id not present';
  END IF;
END $$;
