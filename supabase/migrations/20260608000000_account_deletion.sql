CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  original_user_id UUID PRIMARY KEY,
  email_hash TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retention_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 year',
  deletion_reason TEXT,
  admin_note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.deleted_account_item_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  title TEXT NOT NULL,
  price BIGINT,
  seller_user_id UUID NOT NULL,
  status TEXT,
  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.deleted_account_transaction_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id UUID NOT NULL,
  transaction_id UUID NOT NULL,
  item_id UUID,
  seller_user_id UUID,
  buyer_user_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_deletion_storage_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  storage_provider TEXT,
  object_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_deletion_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_email_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_deleted_accounts_deleted_at
ON public.deleted_accounts(deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_deleted_account_items_user
ON public.deleted_account_item_snapshots(original_user_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_deleted_account_transactions_user
ON public.deleted_account_transaction_snapshots(original_user_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_storage_errors_user
ON public.account_deletion_storage_errors(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_issues_user_created
ON public.account_deletion_issues(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_deletion_issues_unresolved
ON public.account_deletion_issues(created_at DESC)
WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_account_email_bans_active
ON public.account_email_bans(email_hash)
WHERE lifted_at IS NULL;

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_account_item_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_account_transaction_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_storage_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_email_bans ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.deleted_accounts TO authenticated;
GRANT SELECT ON public.deleted_account_item_snapshots TO authenticated;
GRANT SELECT ON public.deleted_account_transaction_snapshots TO authenticated;
GRANT SELECT ON public.account_deletion_storage_errors TO authenticated;
GRANT SELECT ON public.account_deletion_issues TO authenticated;
GRANT SELECT ON public.account_email_bans TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deleted_accounts'
      AND policyname = 'Admins can read deleted accounts'
  ) THEN
    CREATE POLICY "Admins can read deleted accounts"
    ON public.deleted_accounts
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deleted_account_item_snapshots'
      AND policyname = 'Admins can read deleted account item snapshots'
  ) THEN
    CREATE POLICY "Admins can read deleted account item snapshots"
    ON public.deleted_account_item_snapshots
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'deleted_account_transaction_snapshots'
      AND policyname = 'Admins can read deleted account transaction snapshots'
  ) THEN
    CREATE POLICY "Admins can read deleted account transaction snapshots"
    ON public.deleted_account_transaction_snapshots
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_deletion_storage_errors'
      AND policyname = 'Admins can read account deletion storage errors'
  ) THEN
    CREATE POLICY "Admins can read account deletion storage errors"
    ON public.account_deletion_storage_errors
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_deletion_issues'
      AND policyname = 'Admins can read account deletion issues'
  ) THEN
    CREATE POLICY "Admins can read account deletion issues"
    ON public.account_deletion_issues
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_email_bans'
      AND policyname = 'Admins can read account email bans'
  ) THEN
    CREATE POLICY "Admins can read account email bans"
    ON public.account_email_bans
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.clear_deleted_account_retention_by_hash(
  target_email_hash TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_ids UUID[];
  deleted_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  IF target_email_hash IS NULL OR LENGTH(TRIM(target_email_hash)) < 16 THEN
    RAISE EXCEPTION 'email hash is required';
  END IF;

  SELECT COALESCE(array_agg(original_user_id), ARRAY[]::UUID[])
  INTO account_ids
  FROM public.deleted_accounts
  WHERE email_hash = TRIM(target_email_hash);

  IF COALESCE(array_length(account_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.deleted_account_item_snapshots
  WHERE original_user_id = ANY(account_ids);

  DELETE FROM public.deleted_account_transaction_snapshots
  WHERE original_user_id = ANY(account_ids);

  DELETE FROM public.account_deletion_storage_errors
  WHERE user_id = ANY(account_ids);

  DELETE FROM public.account_deletion_issues
  WHERE user_id = ANY(account_ids);

  DELETE FROM public.deleted_accounts
  WHERE original_user_id = ANY(account_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

INSERT INTO public.data_retention_settings(id, label, retention_days, enabled, description)
VALUES (
  'deleted_account_retention',
  '削除済みアカウント保持ログ',
  365,
  TRUE,
  'アカウント削除後、運営対応に必要な最低限ログを保持期限後に削除します。プロフィール・画像・通知など通常利用データは削除時に即時削除または匿名化されます。'
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_get_deleted_account_retention_preview()
RETURNS TABLE (
  setting_id TEXT,
  label TEXT,
  retention_days INTEGER,
  enabled BOOLEAN,
  description TEXT,
  matched_count BIGINT,
  action_summary TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.label,
    s.retention_days,
    s.enabled,
    s.description,
    (
      SELECT COUNT(*)::BIGINT
      FROM public.deleted_accounts da
      WHERE s.enabled
        AND (
          da.retention_until < NOW()
          OR da.deleted_at < NOW() - make_interval(days => s.retention_days)
        )
    ) AS matched_count,
    '削除済みアカウントの保持ログ・関連スナップショットを削除'::TEXT AS action_summary
  FROM public.data_retention_settings s
  WHERE s.id = 'deleted_account_retention';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_deleted_account_retention(dry_run BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_account_ids UUID[] := ARRAY[]::UUID[];
  target_count INTEGER := 0;
  deleted_item_snapshots INTEGER := 0;
  deleted_transaction_snapshots INTEGER := 0;
  deleted_storage_errors INTEGER := 0;
  deleted_issues INTEGER := 0;
  deleted_accounts_count INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  SELECT COALESCE(array_agg(da.original_user_id), ARRAY[]::UUID[])
  INTO target_account_ids
  FROM public.deleted_accounts da
  JOIN public.data_retention_settings s ON s.id = 'deleted_account_retention'
  WHERE s.enabled
    AND (
      da.retention_until < NOW()
      OR da.deleted_at < NOW() - make_interval(days => s.retention_days)
    );

  target_count := COALESCE(array_length(target_account_ids, 1), 0);

  IF dry_run THEN
    RETURN jsonb_build_object(
      'dryRun', TRUE,
      'deletedAccountsToDelete', target_count
    );
  END IF;

  IF target_count = 0 THEN
    RETURN jsonb_build_object(
      'dryRun', FALSE,
      'deletedAccountsDeleted', 0,
      'deletedAccountItemSnapshotsDeleted', 0,
      'deletedAccountTransactionSnapshotsDeleted', 0,
      'accountDeletionStorageErrorsDeleted', 0,
      'accountDeletionIssuesDeleted', 0
    );
  END IF;

  DELETE FROM public.deleted_account_item_snapshots
  WHERE original_user_id = ANY(target_account_ids);
  GET DIAGNOSTICS deleted_item_snapshots = ROW_COUNT;

  DELETE FROM public.deleted_account_transaction_snapshots
  WHERE original_user_id = ANY(target_account_ids);
  GET DIAGNOSTICS deleted_transaction_snapshots = ROW_COUNT;

  DELETE FROM public.account_deletion_storage_errors
  WHERE user_id = ANY(target_account_ids);
  GET DIAGNOSTICS deleted_storage_errors = ROW_COUNT;

  DELETE FROM public.account_deletion_issues
  WHERE user_id = ANY(target_account_ids);
  GET DIAGNOSTICS deleted_issues = ROW_COUNT;

  DELETE FROM public.deleted_accounts
  WHERE original_user_id = ANY(target_account_ids);
  GET DIAGNOSTICS deleted_accounts_count = ROW_COUNT;

  INSERT INTO public.admin_action_logs(admin_user_id, action_type, target_type, target_id, reason, metadata)
  VALUES (
    auth.uid(),
    'deleted_account_retention_run',
    'system',
    'deleted_account_retention',
    'deleted account retention policy execution',
    jsonb_build_object(
      'deletedAccountsDeleted', deleted_accounts_count,
      'deletedAccountItemSnapshotsDeleted', deleted_item_snapshots,
      'deletedAccountTransactionSnapshotsDeleted', deleted_transaction_snapshots,
      'accountDeletionStorageErrorsDeleted', deleted_storage_errors,
      'accountDeletionIssuesDeleted', deleted_issues
    )
  );

  RETURN jsonb_build_object(
    'dryRun', FALSE,
    'deletedAccountsDeleted', deleted_accounts_count,
    'deletedAccountItemSnapshotsDeleted', deleted_item_snapshots,
    'deletedAccountTransactionSnapshotsDeleted', deleted_transaction_snapshots,
    'accountDeletionStorageErrorsDeleted', deleted_storage_errors,
    'accountDeletionIssuesDeleted', deleted_issues
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_current_user_account(
  target_email_hash TEXT,
  deletion_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID := auth.uid();
  active_transaction_count INTEGER := 0;
  deleted_notifications INTEGER := 0;
  deleted_push_subscriptions INTEGER := 0;
  deleted_favorites INTEGER := 0;
  deleted_watch_keywords INTEGER := 0;
  deleted_purchase_locks INTEGER := 0;
  deleted_listing_errors INTEGER := 0;
  deleted_badges INTEGER := 0;
  deleted_reward_overrides INTEGER := 0;
  affected_items INTEGER := 0;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF target_email_hash IS NULL OR LENGTH(TRIM(target_email_hash)) < 16 THEN
    RAISE EXCEPTION 'email hash is required';
  END IF;

  SELECT COUNT(*)
  INTO active_transaction_count
  FROM public.transactions
  WHERE (buyer_id = actor_id OR seller_id = actor_id)
    AND status IN ('requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating');

  IF active_transaction_count > 0 THEN
    RAISE EXCEPTION 'active transactions exist';
  END IF;

  INSERT INTO public.deleted_accounts(original_user_id, email_hash, deletion_reason, metadata)
  VALUES (
    actor_id,
    TRIM(target_email_hash),
    NULLIF(TRIM(COALESCE(deletion_reason, '')), ''),
    jsonb_build_object('source', 'user_request')
  )
  ON CONFLICT (original_user_id)
  DO UPDATE SET
    email_hash = EXCLUDED.email_hash,
    deleted_at = NOW(),
    retention_until = NOW() + INTERVAL '1 year',
    deletion_reason = EXCLUDED.deletion_reason,
    metadata = public.deleted_accounts.metadata || EXCLUDED.metadata;

  INSERT INTO public.deleted_account_item_snapshots(item_id, original_user_id, title, price, seller_user_id, status, created_at)
  SELECT id, actor_id, title, selling_price, seller_id, status, created_at
  FROM public.items
  WHERE seller_id = actor_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.deleted_account_transaction_snapshots(
    original_user_id,
    transaction_id,
    item_id,
    seller_user_id,
    buyer_user_id,
    status,
    created_at,
    completed_at
  )
  SELECT
    actor_id,
    id,
    item_id,
    seller_id,
    buyer_id,
    status,
    created_at,
    COALESCE(completed_at, cancelled_at, created_at)
  FROM public.transactions
  WHERE buyer_id = actor_id OR seller_id = actor_id
  ON CONFLICT DO NOTHING;

  DELETE FROM public.notifications WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_notifications = ROW_COUNT;

  DELETE FROM public.web_push_subscriptions WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_push_subscriptions = ROW_COUNT;

  DELETE FROM public.favorites WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_favorites = ROW_COUNT;

  DELETE FROM public.watch_keywords WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_watch_keywords = ROW_COUNT;

  DELETE FROM public.purchase_lock_attempts WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_purchase_locks = ROW_COUNT;

  DELETE FROM public.listing_image_error_logs WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_listing_errors = ROW_COUNT;

  DELETE FROM public.user_badges WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_badges = ROW_COUNT;

  DELETE FROM public.user_reward_overrides WHERE user_id = actor_id;
  GET DIAGNOSTICS deleted_reward_overrides = ROW_COUNT;

  UPDATE public.items
  SET
    status = 'deleted',
    front_image_url = NULL,
    back_image_url = NULL,
    front_thumbnail_url = NULL,
    back_thumbnail_url = NULL,
    front_image_storage_path = NULL,
    back_image_storage_path = NULL,
    front_thumbnail_storage_path = NULL,
    back_thumbnail_storage_path = NULL,
    locked_by = NULL,
    locked_until = NULL
  WHERE seller_id = actor_id
    AND status <> 'deleted';
  GET DIAGNOSTICS affected_items = ROW_COUNT;

  UPDATE public.profiles
  SET
    nickname = '退会済みユーザー',
    department = '退会済み',
    degree = NULL,
    grade = NULL,
    major = NULL,
    avatar_url = NULL,
    email_notify_watch_keywords = FALSE,
    email_notify_transaction_progress = FALSE,
    email_notify_reminders = FALSE,
    email_notify_chat_messages = FALSE,
    is_deactivated = TRUE,
    deactivated_at = NOW()
  WHERE user_id = actor_id;

  RETURN jsonb_build_object(
    'userId', actor_id,
    'deletedNotifications', deleted_notifications,
    'deletedPushSubscriptions', deleted_push_subscriptions,
    'deletedFavorites', deleted_favorites,
    'deletedWatchKeywords', deleted_watch_keywords,
    'deletedPurchaseLocks', deleted_purchase_locks,
    'deletedListingErrors', deleted_listing_errors,
    'deletedBadges', deleted_badges,
    'deletedRewardOverrides', deleted_reward_overrides,
    'affectedItems', affected_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_current_user_account(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_deleted_account_retention_by_hash(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_deleted_account_retention_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_deleted_account_retention(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
