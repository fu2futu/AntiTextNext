CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user_active
ON public.web_push_subscriptions(user_id, revoked_at);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_push_subscriptions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can read own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can read own web push subscriptions"
    ON public.web_push_subscriptions
    FOR SELECT
    USING (user_id = auth.uid() OR public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can insert own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can insert own web push subscriptions"
    ON public.web_push_subscriptions
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can update own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can update own web push subscriptions"
    ON public.web_push_subscriptions
    FOR UPDATE
    USING (user_id = auth.uid() OR public.is_current_user_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'web_push_subscriptions'
      AND policyname = 'Users can delete own web push subscriptions'
  ) THEN
    CREATE POLICY "Users can delete own web push subscriptions"
    ON public.web_push_subscriptions
    FOR DELETE
    USING (user_id = auth.uid() OR public.is_current_user_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
