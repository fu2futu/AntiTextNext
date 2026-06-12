-- 欲しい本リクエスト機能
-- ユーザーが欲しい本を運営に伝え、運営が管理コンソールでステータス管理する。
-- 出品時にリクエスト本タイトルと部分一致したらリクエスト者へ通知する。

CREATE TABLE IF NOT EXISTS public.book_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name TEXT,
  book_title TEXT NOT NULL,
  author TEXT,
  course_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'posted', 'done', 'no_action')),
  admin_note TEXT,
  assignee_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_book_requests_status_created
ON public.book_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_book_requests_requester
ON public.book_requests(requester_id);

ALTER TABLE public.book_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.book_requests TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'book_requests'
      AND policyname = 'Users can insert own book requests'
  ) THEN
    CREATE POLICY "Users can insert own book requests"
    ON public.book_requests
    FOR INSERT
    WITH CHECK (requester_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'book_requests'
      AND policyname = 'Users and admins can read book requests'
  ) THEN
    CREATE POLICY "Users and admins can read book requests"
    ON public.book_requests
    FOR SELECT
    USING (requester_id = auth.uid() OR public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'book_requests'
      AND policyname = 'Admins can update book requests'
  ) THEN
    CREATE POLICY "Admins can update book requests"
    ON public.book_requests
    FOR UPDATE
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
  END IF;
END $$;

-- 出品の通知は運営が管理画面から手動で送信する（既存 admin_send_user_notification RPC を利用）。

NOTIFY pgrst, 'reload schema';
