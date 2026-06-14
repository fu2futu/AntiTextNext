CREATE TABLE IF NOT EXISTS public.app_notice_banner (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_notice_banner(id, enabled, message)
VALUES ('global', FALSE, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_notice_banner ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.app_notice_banner TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_notice_banner TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_notice_banner'
      AND policyname = 'Anyone can read app notice banner'
  ) THEN
    CREATE POLICY "Anyone can read app notice banner"
    ON public.app_notice_banner
    FOR SELECT
    USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_notice_banner'
      AND policyname = 'Admins can manage app notice banner'
  ) THEN
    CREATE POLICY "Admins can manage app notice banner"
    ON public.app_notice_banner
    FOR ALL
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
