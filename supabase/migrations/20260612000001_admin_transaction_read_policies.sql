DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'Admins can read transactions'
  ) THEN
    CREATE POLICY "Admins can read transactions"
    ON public.transactions
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'Admins can read messages'
  ) THEN
    CREATE POLICY "Admins can read messages"
    ON public.messages
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ratings'
      AND policyname = 'Admins can read ratings'
  ) THEN
    CREATE POLICY "Admins can read ratings"
    ON public.ratings
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
