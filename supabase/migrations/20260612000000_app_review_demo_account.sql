ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_app_review_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_app_review_demo
ON public.profiles(is_app_review_demo)
WHERE is_app_review_demo = TRUE;

COMMENT ON COLUMN public.profiles.is_app_review_demo IS 'True for App Store review demo accounts. These users may operate demo data only.';

CREATE OR REPLACE FUNCTION public.is_current_user_app_review_demo()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND COALESCE(p.is_app_review_demo, FALSE) = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_app_review_demo(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = target_user_id
      AND COALESCE(p.is_app_review_demo, FALSE) = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_app_review_demo(
  target_user_id UUID,
  enabled BOOLEAN,
  reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user is required';
  END IF;

  UPDATE public.profiles
  SET is_app_review_demo = COALESCE(enabled, FALSE)
  WHERE user_id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  PERFORM public.admin_log_action(
    CASE WHEN COALESCE(enabled, FALSE) THEN 'app_review_demo_enabled' ELSE 'app_review_demo_disabled' END,
    'user',
    target_user_id::TEXT,
    COALESCE(NULLIF(TRIM(reason), ''), 'App Review demo flag updated'),
    jsonb_build_object('enabled', COALESCE(enabled, FALSE))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_app_review_demo_data(
  target_user_id UUID,
  reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_transaction_ids UUID[] := ARRAY[]::UUID[];
  demo_item_ids UUID[] := ARRAY[]::UUID[];
  deleted_ratings INTEGER := 0;
  deleted_messages INTEGER := 0;
  deleted_notifications INTEGER := 0;
  deleted_transactions INTEGER := 0;
  reopened_items INTEGER := 0;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'target user is required';
  END IF;

  IF NOT public.is_user_app_review_demo(target_user_id) THEN
    RAISE EXCEPTION 'target user is not an app review demo account';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
  INTO demo_transaction_ids
  FROM public.transactions
  WHERE is_demo = TRUE
    AND (buyer_id = target_user_id OR seller_id = target_user_id);

  SELECT COALESCE(array_agg(DISTINCT item_id), ARRAY[]::UUID[])
  INTO demo_item_ids
  FROM public.transactions
  WHERE id = ANY(demo_transaction_ids);

  IF COALESCE(array_length(demo_transaction_ids, 1), 0) > 0 THEN
    DELETE FROM public.ratings
    WHERE transaction_id = ANY(demo_transaction_ids);
    GET DIAGNOSTICS deleted_ratings = ROW_COUNT;

    DELETE FROM public.messages
    WHERE transaction_id = ANY(demo_transaction_ids);
    GET DIAGNOSTICS deleted_messages = ROW_COUNT;

    DELETE FROM public.notifications
    WHERE user_id = target_user_id
      OR (
        link_type = 'chat'
        AND EXISTS (
          SELECT 1
          FROM unnest(demo_transaction_ids) AS tx_id
          WHERE link_id LIKE '%' || tx_id::TEXT || '%'
        )
      );
    GET DIAGNOSTICS deleted_notifications = ROW_COUNT;

    DELETE FROM public.transactions
    WHERE id = ANY(demo_transaction_ids)
      AND is_demo = TRUE;
    GET DIAGNOSTICS deleted_transactions = ROW_COUNT;

    UPDATE public.items
    SET status = 'available',
        locked_by = NULL,
        locked_until = NULL
    WHERE id = ANY(demo_item_ids)
      AND is_demo = TRUE;
    GET DIAGNOSTICS reopened_items = ROW_COUNT;
  END IF;

  PERFORM public.admin_log_action(
    'app_review_demo_data_reset',
    'user',
    target_user_id::TEXT,
    COALESCE(NULLIF(TRIM(reason), ''), 'App Review demo data reset'),
    jsonb_build_object(
      'deletedRatings', deleted_ratings,
      'deletedMessages', deleted_messages,
      'deletedNotifications', deleted_notifications,
      'deletedTransactions', deleted_transactions,
      'reopenedItems', reopened_items
    )
  );

  RETURN jsonb_build_object(
    'deletedRatings', deleted_ratings,
    'deletedMessages', deleted_messages,
    'deletedNotifications', deleted_notifications,
    'deletedTransactions', deleted_transactions,
    'reopenedItems', reopened_items
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_item_lock(target_item_id UUID, locker_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR locker_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('app.bypass_item_update_guard', 'on', true);

  UPDATE public.items
  SET locked_by = NULL,
      locked_until = NULL
  WHERE id = target_item_id
    AND locked_by = auth.uid();

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_item_pending_after_transaction_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.bypass_item_update_guard', 'on', true);

  UPDATE public.items
  SET status = 'transaction_pending',
      locked_by = NULL,
      locked_until = NULL
  WHERE id = NEW.item_id
    AND locked_by = NEW.buyer_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_purchase_eligibility(
  p_buyer_id UUID,
  p_item_id UUID,
  p_seller_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_is_demo BOOLEAN := FALSE;
  buyer_is_app_review BOOLEAN := FALSE;
BEGIN
  IF p_buyer_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'authentication_required');
  END IF;

  SELECT COALESCE(is_demo, FALSE)
  INTO item_is_demo
  FROM public.items
  WHERE id = p_item_id;

  buyer_is_app_review := public.is_user_app_review_demo(p_buyer_id);

  IF buyer_is_app_review AND NOT COALESCE(item_is_demo, FALSE) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'app_review_real_item_blocked');
  END IF;

  IF COALESCE(item_is_demo, FALSE) AND NOT buyer_is_app_review AND NOT public.is_current_user_admin() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'demo_item_only');
  END IF;

  IF p_buyer_id = p_seller_id THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'seller_cannot_buy_own_item');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE item_id = p_item_id
      AND buyer_id = p_buyer_id
      AND status IN ('requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating')
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'pending_request_exists');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE item_id = p_item_id
      AND status IN ('requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating')
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'active_transaction_exists');
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_item_lock(
  target_item_id UUID,
  locker_id UUID,
  lock_until TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  locker_is_app_review BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR locker_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;

  SELECT id, status, locked_by, locked_until, COALESCE(is_demo, FALSE) AS is_demo
  INTO item_record
  FROM public.items
  WHERE id = target_item_id
  FOR UPDATE;

  IF item_record.id IS NULL OR item_record.status <> 'available' THEN
    RETURN FALSE;
  END IF;

  locker_is_app_review := public.is_user_app_review_demo(locker_id);

  IF locker_is_app_review AND item_record.is_demo IS DISTINCT FROM TRUE THEN
    RETURN FALSE;
  END IF;

  IF item_record.is_demo IS TRUE AND NOT locker_is_app_review AND NOT public.is_current_user_admin() THEN
    RETURN FALSE;
  END IF;

  IF item_record.locked_by IS NOT NULL
     AND item_record.locked_by IS DISTINCT FROM locker_id
     AND item_record.locked_until IS NOT NULL
     AND item_record.locked_until > NOW() THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('app.bypass_item_update_guard', 'on', true);

  UPDATE public.items
  SET locked_by = locker_id,
      locked_until = lock_until
  WHERE id = target_item_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_purchase_request(
  target_item_id UUID,
  payment_method TEXT,
  meetup_time_slots TEXT[],
  meetup_locations TEXT[],
  auto_message TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  transaction_id UUID;
  buyer_nickname TEXT;
  eligibility JSONB;
  actor_is_app_review BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  SELECT id, title, seller_id, status, locked_by, locked_until, COALESCE(is_demo, FALSE) AS is_demo
  INTO item_record
  FROM public.items
  WHERE id = target_item_id
  FOR UPDATE;

  IF item_record.id IS NULL THEN
    RAISE EXCEPTION 'item not found';
  END IF;

  actor_is_app_review := public.is_current_user_app_review_demo();

  IF actor_is_app_review AND item_record.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only request demo items';
  END IF;

  IF item_record.is_demo IS TRUE AND NOT actor_is_app_review AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'demo items are only available for app review demo accounts';
  END IF;

  IF item_record.seller_id = auth.uid() THEN
    RAISE EXCEPTION 'seller cannot buy own item';
  END IF;

  IF item_record.status <> 'available' THEN
    RAISE EXCEPTION 'item is not available';
  END IF;

  IF item_record.locked_by IS DISTINCT FROM auth.uid()
     OR item_record.locked_until IS NULL
     OR item_record.locked_until <= NOW() THEN
    RAISE EXCEPTION 'valid purchase lock is required';
  END IF;

  eligibility := public.check_purchase_eligibility(auth.uid(), target_item_id, item_record.seller_id);
  IF NOT (eligibility->>'allowed')::boolean THEN
    RAISE EXCEPTION 'eligibility check failed: %', eligibility->>'reason';
  END IF;

  INSERT INTO public.transactions(
    item_id,
    buyer_id,
    seller_id,
    payment_method,
    meetup_time_slots,
    meetup_locations,
    status,
    is_demo
  )
  VALUES (
    target_item_id,
    auth.uid(),
    item_record.seller_id,
    payment_method,
    meetup_time_slots,
    meetup_locations,
    'accepted',
    item_record.is_demo
  )
  RETURNING id INTO transaction_id;

  INSERT INTO public.purchase_request_history(item_id, buyer_id, seller_id, status)
  VALUES (target_item_id, auth.uid(), item_record.seller_id, 'accepted');

  PERFORM set_config('app.bypass_item_update_guard', 'on', true);

  UPDATE public.items
  SET status = 'trading',
      locked_by = NULL,
      locked_until = NULL
  WHERE id = target_item_id;

  INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
  VALUES (target_item_id, transaction_id, auth.uid(), item_record.seller_id, auto_message, false);

  SELECT COALESCE(nickname, '購入者')
  INTO buyer_nickname
  FROM public.profiles
  WHERE user_id = auth.uid();

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES (
    item_record.seller_id,
    'purchase_request',
    '購入相談が届きました',
    COALESCE(buyer_nickname, '購入者') || 'さんから購入リクエストが届きました。チャットで受け渡し日時や場所を相談してください。',
    'chat',
    target_item_id::text || '?tx=' || transaction_id::text,
    false
  );

  RETURN transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_item_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NEW.seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'seller_id must be current user';
  END IF;

  IF public.is_current_user_app_review_demo() THEN
    NEW.is_demo := TRUE;
    NEW.demo_purpose := COALESCE(NULLIF(NEW.demo_purpose, ''), 'app_store_review');
  ELSIF NOT public.is_current_user_admin() THEN
    NEW.is_demo := FALSE;
    NEW.created_by_admin_id := NULL;
    NEW.demo_purpose := NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_restrictions ur
    WHERE ur.user_id = auth.uid()
      AND ur.lifted_at IS NULL
      AND (ur.ends_at IS NULL OR ur.ends_at > NOW())
      AND ur.restriction_type IN ('temporary_suspend', 'permanent_ban', 'listing_stop')
  ) THEN
    RAISE EXCEPTION 'listing is restricted';
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_item_update_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only seller can update item';
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'seller_id cannot be changed';
  END IF;

  IF public.is_current_user_app_review_demo() THEN
    IF OLD.is_demo IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'app review accounts cannot update real items';
    END IF;

    NEW.is_demo := TRUE;
    NEW.demo_purpose := COALESCE(NULLIF(NEW.demo_purpose, ''), OLD.demo_purpose, 'app_store_review');
  ELSE
    IF OLD.is_demo IS TRUE THEN
      RAISE EXCEPTION 'demo items can only be updated by admins or app review accounts';
    END IF;

    NEW.is_demo := FALSE;
    NEW.created_by_admin_id := NULL;
    NEW.demo_purpose := NULL;
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_item_update_trigger ON public.items;
CREATE TRIGGER validate_item_update_trigger
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.validate_item_update();

CREATE OR REPLACE FUNCTION public.validate_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_transaction RECORD;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF public.is_current_user_admin()
     AND NEW.transaction_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.transactions t
       WHERE t.id = NEW.transaction_id
         AND t.item_id = NEW.item_id
         AND t.is_demo = TRUE
         AND (
           (t.buyer_id = NEW.sender_id AND t.seller_id = NEW.receiver_id)
           OR
           (t.seller_id = NEW.sender_id AND t.buyer_id = NEW.receiver_id)
         )
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sender_id must be current user';
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  SELECT t.id, t.is_demo
  INTO matched_transaction
  FROM public.transactions t
  WHERE t.item_id = NEW.item_id
    AND (
      (t.buyer_id = NEW.sender_id AND t.seller_id = NEW.receiver_id)
      OR
      (t.seller_id = NEW.sender_id AND t.buyer_id = NEW.receiver_id)
    )
    AND (
      NEW.transaction_id IS NULL
      OR t.id = NEW.transaction_id
    )
    AND t.status IN (
      'requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating',
      'completed', 'cancelled', 'rejected', 'expired', 'auto_closed',
      'pending_approval', 'pending', 'confirmed', 'declined'
    )
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF matched_transaction.id IS NULL THEN
    RAISE EXCEPTION 'message participants do not match transaction';
  END IF;

  IF public.is_current_user_app_review_demo() AND matched_transaction.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only message in demo transactions';
  END IF;

  IF NEW.transaction_id IS NULL THEN
    NEW.transaction_id := matched_transaction.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_transaction_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_current_user_admin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF auth.uid() NOT IN (OLD.buyer_id, OLD.seller_id) THEN
    RAISE EXCEPTION 'only transaction participants can update transaction';
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  IF public.is_current_user_app_review_demo() AND OLD.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only update demo transactions';
  END IF;

  IF NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.seller_id IS DISTINCT FROM OLD.seller_id
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'transaction parties cannot be changed';
  END IF;

  RETURN NEW;
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

  IF public.is_current_user_app_review_demo() AND tx_record.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only rate demo transactions';
  END IF;

  IF auth.uid() = tx_record.buyer_id THEN
    rated_user_id := tx_record.seller_id;
  ELSIF auth.uid() = tx_record.seller_id THEN
    rated_user_id := tx_record.buyer_id;
  ELSE
    RAISE EXCEPTION 'only transaction participants can rate';
  END IF;

  INSERT INTO public.ratings(transaction_id, rater_id, rated_id, score, comment, is_demo)
  VALUES (target_transaction_id, auth.uid(), rated_user_id, score_value, comment_text, COALESCE(tx_record.is_demo, FALSE));

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

    PERFORM set_config('app.bypass_item_update_guard', 'on', true);

    UPDATE public.items
    SET status = 'sold'
    WHERE id = tx_record.item_id;

    INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
    VALUES (
      tx_record.item_id,
      target_transaction_id,
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
        tx_record.item_id::TEXT || '?tx=' || target_transaction_id::TEXT,
        false
      ),
      (
        auth.uid(),
        'transaction_completed',
        '取引が完了しました',
        '双方の評価が完了したため、取引が正式に完了しました。',
        'chat',
        tx_record.item_id::TEXT || '?tx=' || target_transaction_id::TEXT,
        false
      );

    RETURN TRUE;
  END IF;

  INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
  VALUES (
    tx_record.item_id,
    target_transaction_id,
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
    tx_record.item_id::TEXT || '?tx=' || target_transaction_id::TEXT,
    false
  );

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_app_review_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_app_review_demo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_app_review_demo(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_app_review_demo_data(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_item_lock(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_purchase_eligibility(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_item_lock(UUID, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_purchase_request(UUID, TEXT, TEXT[], TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_transaction_rating(UUID, INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
