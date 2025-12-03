# Finance policy checks

Manual steps to confirm the `accounts`, `budgets` and `transactions` policies enforce `auth.uid() = user_id` without relying on the `service_role` key.

## Prerequisites
- Use Supabase SQL editor or `supabase db remote commit -f` with an authenticated session.
- Replace the UUIDs below with two existing user IDs in your project.

## Setup
1. Start a transaction and impersonate **User A** (owner):
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims', '{"sub":"<user-a-uuid>","role":"authenticated"}', true);
   ```
2. Create seed rows owned by User A (one per table):
   ```sql
   INSERT INTO public.accounts (user_id, name) VALUES ('<user-a-uuid>', 'owner account');
   INSERT INTO public.budgets (user_id, name) VALUES ('<user-a-uuid>', 'owner budget');
   INSERT INTO public.transactions (user_id, description, amount) VALUES ('<user-a-uuid>', 'owner txn', 1);
   COMMIT;
   ```

## Denial checks (User B)
1. Impersonate **User B** without using the service role key:
   ```sql
   BEGIN;
   SELECT set_config('request.jwt.claims', '{"sub":"<user-b-uuid>","role":"authenticated"}', true);
   ```
2. Verify selects return no cross-tenant rows:
   ```sql
   SELECT * FROM public.accounts WHERE name = 'owner account';
   SELECT * FROM public.budgets WHERE name = 'owner budget';
   SELECT * FROM public.transactions WHERE description = 'owner txn';
   ```
   Each query should return **zero** rows.
3. Confirm write operations are blocked for foreign `user_id` values:
   ```sql
   -- Should fail with RLS/policy error
   INSERT INTO public.accounts (user_id, name) VALUES ('<user-a-uuid>', 'forbidden account');
   UPDATE public.budgets SET name = 'forbidden budget' WHERE name = 'owner budget';
   DELETE FROM public.transactions WHERE description = 'owner txn';
   ROLLBACK;
   ```
   Each statement should raise an RLS/policy violation because `auth.uid()` is different from the target `user_id`.

## Positive path (User A)
Re-run the same statements with `sub` set to `<user-a-uuid>` to confirm inserts/updates/deletes succeed for the owner while the policies remain enforced.
