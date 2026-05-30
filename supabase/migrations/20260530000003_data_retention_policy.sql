CREATE TABLE IF NOT EXISTS public.data_retention_settings (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

INSERT INTO public.data_retention_settings(id, label, retention_days, enabled, description)
VALUES
  ('account_profile_after_deactivation', 'アカウント情報', 365, TRUE, '退会後、プロフィール上の個人情報を匿名化します。auth.users の物理削除は別途検証対象です。'),
  ('rating_after_deactivation', '評価情報', 365, TRUE, '退会後、評価コメントを削除し、評価レコードも期限後に削除します。'),
  ('transaction_chat_after_terminal', '取引チャット', 30, TRUE, '取引終了後、該当する送受信者ペアのチャット本文と関連通知を削除します。'),
  ('reports_after_completed', '通報・違反対応記録', 365, TRUE, '対応終了後、通報レコードを削除します。'),
  ('access_logs', 'アクセスログ', 30, TRUE, '取得後、アクセス集計用ログを削除します。')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.data_retention_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.data_retention_settings TO authenticated;
GRANT INSERT, UPDATE ON public.data_retention_settings TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_retention_settings'
      AND policyname = 'Admins can read data retention settings'
  ) THEN
    CREATE POLICY "Admins can read data retention settings"
    ON public.data_retention_settings
    FOR SELECT
    USING (public.is_current_user_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_retention_settings'
      AND policyname = 'Admins can manage data retention settings'
  ) THEN
    CREATE POLICY "Admins can manage data retention settings"
    ON public.data_retention_settings
    FOR ALL
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.retention_days(setting_id TEXT, fallback_days INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT retention_days
      FROM public.data_retention_settings
      WHERE id = setting_id
        AND enabled = TRUE
    ),
    fallback_days
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_update_data_retention_setting(
  setting_id TEXT,
  new_retention_days INTEGER,
  new_enabled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  IF new_retention_days < 1 OR new_retention_days > 3650 THEN
    RAISE EXCEPTION 'retention_days must be between 1 and 3650';
  END IF;

  UPDATE public.data_retention_settings
  SET retention_days = new_retention_days,
      enabled = new_enabled,
      updated_by = auth.uid(),
      updated_at = NOW()
  WHERE id = setting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'retention setting not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_data_retention_preview()
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
    CASE s.id
      WHEN 'account_profile_after_deactivation' THEN (
        SELECT COUNT(*)::BIGINT
        FROM public.profiles p
        WHERE s.enabled
          AND COALESCE(p.is_deactivated, FALSE) = TRUE
          AND p.deactivated_at IS NOT NULL
          AND p.deactivated_at < NOW() - make_interval(days => s.retention_days)
      )
      WHEN 'rating_after_deactivation' THEN (
        SELECT COUNT(*)::BIGINT
        FROM public.ratings r
        LEFT JOIN public.profiles pr ON pr.user_id = r.rater_id
        LEFT JOIN public.profiles pd ON pd.user_id = r.rated_id
        WHERE s.enabled
          AND (
            (COALESCE(pr.is_deactivated, FALSE) = TRUE AND pr.deactivated_at < NOW() - make_interval(days => s.retention_days))
            OR
            (COALESCE(pd.is_deactivated, FALSE) = TRUE AND pd.deactivated_at < NOW() - make_interval(days => s.retention_days))
          )
      )
      WHEN 'transaction_chat_after_terminal' THEN (
        SELECT COUNT(*)::BIGINT
        FROM public.messages m
        WHERE s.enabled
          AND EXISTS (
            SELECT 1
            FROM public.transactions t
            WHERE t.item_id = m.item_id
              AND t.status IN ('completed', 'cancelled', 'rejected', 'expired', 'auto_closed')
              AND COALESCE(t.completed_at, t.cancelled_at, t.declined_at, t.created_at) < NOW() - make_interval(days => s.retention_days)
              AND (
                (m.sender_id = t.buyer_id AND m.receiver_id = t.seller_id)
                OR
                (m.sender_id = t.seller_id AND m.receiver_id = t.buyer_id)
              )
          )
      )
      WHEN 'reports_after_completed' THEN (
        SELECT COUNT(*)::BIGINT
        FROM public.reports r
        WHERE s.enabled
          AND r.status IN ('completed', 'resolved', 'closed')
          AND COALESCE(r.updated_at, r.created_at) < NOW() - make_interval(days => s.retention_days)
      )
      WHEN 'access_logs' THEN (
        SELECT (
          (SELECT COUNT(*) FROM public.site_access_hourly_visitors h WHERE h.access_hour < NOW() - make_interval(days => s.retention_days))
          +
          (SELECT COUNT(*) FROM public.site_access_daily d WHERE d.access_date < (NOW() AT TIME ZONE 'Asia/Tokyo')::date - s.retention_days)
        )::BIGINT
      )
      ELSE 0::BIGINT
    END AS matched_count,
    CASE s.id
      WHEN 'account_profile_after_deactivation' THEN 'プロフィールを退会済み表示へ匿名化'
      WHEN 'rating_after_deactivation' THEN '退会済みユーザーに紐づく評価を削除'
      WHEN 'transaction_chat_after_terminal' THEN '終了済み取引のチャット本文と関連通知を削除'
      WHEN 'reports_after_completed' THEN '対応終了済みの通報レコードを削除'
      WHEN 'access_logs' THEN 'アクセスログ集計レコードを削除'
      ELSE '-'
    END AS action_summary
  FROM public.data_retention_settings s
  ORDER BY
    CASE s.id
      WHEN 'account_profile_after_deactivation' THEN 1
      WHEN 'rating_after_deactivation' THEN 2
      WHEN 'transaction_chat_after_terminal' THEN 3
      WHEN 'reports_after_completed' THEN 4
      WHEN 'access_logs' THEN 5
      ELSE 99
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_data_retention(dry_run BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_days INTEGER := public.retention_days('account_profile_after_deactivation', 365);
  rating_days INTEGER := public.retention_days('rating_after_deactivation', 365);
  chat_days INTEGER := public.retention_days('transaction_chat_after_terminal', 30);
  report_days INTEGER := public.retention_days('reports_after_completed', 365);
  access_days INTEGER := public.retention_days('access_logs', 30);
  anonymized_profiles INTEGER := 0;
  deleted_ratings INTEGER := 0;
  deleted_messages INTEGER := 0;
  deleted_chat_notifications INTEGER := 0;
  deleted_reports INTEGER := 0;
  deleted_hourly_access INTEGER := 0;
  deleted_daily_access INTEGER := 0;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  IF dry_run THEN
    SELECT COALESCE(SUM(matched_count), 0)::INTEGER
    INTO anonymized_profiles
    FROM public.admin_get_data_retention_preview()
    WHERE setting_id = 'account_profile_after_deactivation';

    SELECT COALESCE(SUM(matched_count), 0)::INTEGER
    INTO deleted_ratings
    FROM public.admin_get_data_retention_preview()
    WHERE setting_id = 'rating_after_deactivation';

    SELECT COALESCE(SUM(matched_count), 0)::INTEGER
    INTO deleted_messages
    FROM public.admin_get_data_retention_preview()
    WHERE setting_id = 'transaction_chat_after_terminal';

    SELECT COALESCE(SUM(matched_count), 0)::INTEGER
    INTO deleted_reports
    FROM public.admin_get_data_retention_preview()
    WHERE setting_id = 'reports_after_completed';

    SELECT COALESCE(SUM(matched_count), 0)::INTEGER
    INTO deleted_hourly_access
    FROM public.admin_get_data_retention_preview()
    WHERE setting_id = 'access_logs';

    RETURN jsonb_build_object(
      'dryRun', TRUE,
      'profilesToAnonymize', anonymized_profiles,
      'ratingsToDelete', deleted_ratings,
      'messagesToDelete', deleted_messages,
      'reportsToDelete', deleted_reports,
      'accessRowsToDelete', deleted_hourly_access
    );
  END IF;

  UPDATE public.profiles
  SET nickname = '退会済みユーザー',
      avatar_url = NULL,
      department = NULL,
      major = NULL,
      degree = NULL,
      grade = NULL
  WHERE COALESCE(is_deactivated, FALSE) = TRUE
    AND deactivated_at IS NOT NULL
    AND deactivated_at < NOW() - make_interval(days => account_days);
  GET DIAGNOSTICS anonymized_profiles = ROW_COUNT;

  DELETE FROM public.ratings r
  USING public.profiles pr, public.profiles pd
  WHERE pr.user_id = r.rater_id
    AND pd.user_id = r.rated_id
    AND (
      (COALESCE(pr.is_deactivated, FALSE) = TRUE AND pr.deactivated_at < NOW() - make_interval(days => rating_days))
      OR
      (COALESCE(pd.is_deactivated, FALSE) = TRUE AND pd.deactivated_at < NOW() - make_interval(days => rating_days))
    );
  GET DIAGNOSTICS deleted_ratings = ROW_COUNT;

  DELETE FROM public.messages m
  WHERE EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.item_id = m.item_id
      AND t.status IN ('completed', 'cancelled', 'rejected', 'expired', 'auto_closed')
      AND COALESCE(t.completed_at, t.cancelled_at, t.declined_at, t.created_at) < NOW() - make_interval(days => chat_days)
      AND (
        (m.sender_id = t.buyer_id AND m.receiver_id = t.seller_id)
        OR
        (m.sender_id = t.seller_id AND m.receiver_id = t.buyer_id)
      )
  );
  GET DIAGNOSTICS deleted_messages = ROW_COUNT;

  DELETE FROM public.notifications n
  WHERE COALESCE(n.link_type, '') IN ('chat', 'transaction')
    AND EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE n.link_id IN (t.item_id::TEXT, t.item_id::TEXT || '?tx=' || t.id::TEXT, t.id::TEXT)
        AND t.status IN ('completed', 'cancelled', 'rejected', 'expired', 'auto_closed')
        AND COALESCE(t.completed_at, t.cancelled_at, t.declined_at, t.created_at) < NOW() - make_interval(days => chat_days)
    );
  GET DIAGNOSTICS deleted_chat_notifications = ROW_COUNT;

  DELETE FROM public.reports r
  WHERE r.status IN ('completed', 'resolved', 'closed')
    AND COALESCE(r.updated_at, r.created_at) < NOW() - make_interval(days => report_days);
  GET DIAGNOSTICS deleted_reports = ROW_COUNT;

  DELETE FROM public.site_access_hourly_visitors
  WHERE access_hour < NOW() - make_interval(days => access_days);
  GET DIAGNOSTICS deleted_hourly_access = ROW_COUNT;

  DELETE FROM public.site_access_daily
  WHERE access_date < (NOW() AT TIME ZONE 'Asia/Tokyo')::date - access_days;
  GET DIAGNOSTICS deleted_daily_access = ROW_COUNT;

  INSERT INTO public.admin_action_logs(admin_user_id, action_type, target_type, target_id, reason, metadata)
  VALUES (
    auth.uid(),
    'data_retention_run',
    'system',
    'data_retention',
    'retention policy execution',
    jsonb_build_object(
      'profilesAnonymized', anonymized_profiles,
      'ratingsDeleted', deleted_ratings,
      'messagesDeleted', deleted_messages,
      'chatNotificationsDeleted', deleted_chat_notifications,
      'reportsDeleted', deleted_reports,
      'hourlyAccessDeleted', deleted_hourly_access,
      'dailyAccessDeleted', deleted_daily_access
    )
  );

  RETURN jsonb_build_object(
    'dryRun', FALSE,
    'profilesAnonymized', anonymized_profiles,
    'ratingsDeleted', deleted_ratings,
    'messagesDeleted', deleted_messages,
    'chatNotificationsDeleted', deleted_chat_notifications,
    'reportsDeleted', deleted_reports,
    'hourlyAccessDeleted', deleted_hourly_access,
    'dailyAccessDeleted', deleted_daily_access
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_transaction_rating(
  target_transaction_id UUID,
  score_value INTEGER,
  comment_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  rated_user_id UUID;
  other_rating_exists BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF score_value < 1 OR score_value > 5 THEN
    RAISE EXCEPTION 'rating score must be between 1 and 5';
  END IF;

  SELECT *
  INTO tx_record
  FROM public.transactions
  WHERE id = target_transaction_id
  FOR UPDATE;

  IF tx_record.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  IF tx_record.status <> 'awaiting_rating' THEN
    RAISE EXCEPTION 'transaction is not awaiting rating';
  END IF;

  IF auth.uid() = tx_record.buyer_id THEN
    rated_user_id := tx_record.seller_id;
  ELSIF auth.uid() = tx_record.seller_id THEN
    rated_user_id := tx_record.buyer_id;
  ELSE
    RAISE EXCEPTION 'only transaction participants can rate';
  END IF;

  INSERT INTO public.ratings(transaction_id, rater_id, rated_id, score, comment)
  VALUES (target_transaction_id, auth.uid(), rated_user_id, score_value, comment_text);

  SELECT EXISTS (
    SELECT 1
    FROM public.ratings
    WHERE transaction_id = target_transaction_id
      AND rater_id = rated_user_id
  )
  INTO other_rating_exists;

  IF other_rating_exists THEN
    UPDATE public.transactions
    SET status = 'completed',
        completed_at = NOW()
    WHERE id = target_transaction_id;

    UPDATE public.items
    SET status = 'sold'
    WHERE id = tx_record.item_id;

    INSERT INTO public.messages(item_id, sender_id, receiver_id, message, is_read)
    VALUES (
      tx_record.item_id,
      auth.uid(),
      rated_user_id,
      '【評価が送信されました】' || E'\n\n' || '双方の評価が完了したため、取引が正式に完了しました。ご利用ありがとうございました!',
      false
    );

    INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
    VALUES
      (
        rated_user_id,
        'transaction_completed',
        '取引が完了しました',
        '双方の評価が完了したため、取引が正式に完了しました。',
        'chat',
        tx_record.item_id,
        false
      ),
      (
        auth.uid(),
        'transaction_completed',
        '取引が完了しました',
        '双方の評価が完了したため、取引が正式に完了しました。',
        'chat',
        tx_record.item_id,
        false
      );

    RETURN TRUE;
  END IF;

  INSERT INTO public.messages(item_id, sender_id, receiver_id, message, is_read)
  VALUES (
    tx_record.item_id,
    auth.uid(),
    rated_user_id,
    '【評価が送信されました】' || E'\n\n' || '取引完了ボタンより、取引完了及び評価を行ってください。',
    false
  );

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES (
    rated_user_id,
    'rating_received',
    '評価をしてください',
    '取引相手から評価が送信されました。取引完了ボタンより、取引完了及び評価を行ってください。',
    'chat',
    tx_record.item_id,
    false
  );

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_data_retention_setting(TEXT, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_data_retention_preview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_data_retention(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_transaction_rating(UUID, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
