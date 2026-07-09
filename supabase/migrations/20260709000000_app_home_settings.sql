-- ホーム画面のセクション表示設定（管理画面から調整可能）。
-- 現状は「あなたへのおすすめ」セクションの表示可否のみを持つ。
CREATE TABLE IF NOT EXISTS public.app_home_settings (
  id TEXT PRIMARY KEY,
  recommended_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 依頼により初期状態は「あなたへのおすすめ」を非表示(FALSE)で投入する。
INSERT INTO public.app_home_settings(id, recommended_enabled)
VALUES ('global', FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_home_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.app_home_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.app_home_settings TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_home_settings'
      AND policyname = 'Anyone can read app home settings'
  ) THEN
    CREATE POLICY "Anyone can read app home settings"
    ON public.app_home_settings
    FOR SELECT
    USING (TRUE);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_home_settings'
      AND policyname = 'Admins can manage app home settings'
  ) THEN
    CREATE POLICY "Admins can manage app home settings"
    ON public.app_home_settings
    FOR ALL
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
