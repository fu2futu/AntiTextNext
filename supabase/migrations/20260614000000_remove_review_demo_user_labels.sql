CREATE OR REPLACE FUNCTION public.admin_create_demo_transaction(
  target_item_id UUID,
  target_buyer_id UUID,
  payment_method TEXT DEFAULT 'other',
  meetup_time_slots TEXT[] DEFAULT ARRAY[]::TEXT[],
  meetup_locations TEXT[] DEFAULT ARRAY[]::TEXT[],
  auto_message TEXT DEFAULT NULL
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
  message_text TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin permission required';
  END IF;

  SELECT id, title, seller_id, status, is_demo
  INTO item_record
  FROM public.items
  WHERE id = target_item_id
  FOR UPDATE;

  IF item_record.id IS NULL THEN
    RAISE EXCEPTION 'demo item not found';
  END IF;

  IF item_record.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'item is not a demo item';
  END IF;

  IF item_record.seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'demo item seller must be the current admin';
  END IF;

  IF target_buyer_id IS NULL OR target_buyer_id = item_record.seller_id THEN
    RAISE EXCEPTION 'invalid demo buyer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = target_buyer_id) THEN
    RAISE EXCEPTION 'demo buyer profile not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE item_id = target_item_id
      AND is_demo = TRUE
      AND status IN ('requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating')
  ) THEN
    RAISE EXCEPTION 'active demo transaction already exists';
  END IF;

  INSERT INTO public.transactions(
    item_id,
    buyer_id,
    seller_id,
    payment_method,
    meetup_time_slots,
    meetup_locations,
    status,
    is_demo,
    created_by_admin_id
  )
  VALUES (
    target_item_id,
    target_buyer_id,
    item_record.seller_id,
    COALESCE(NULLIF(TRIM(payment_method), ''), 'other'),
    COALESCE(meetup_time_slots, ARRAY[]::TEXT[]),
    COALESCE(meetup_locations, ARRAY[]::TEXT[]),
    'accepted',
    TRUE,
    auth.uid()
  )
  RETURNING id INTO transaction_id;

  UPDATE public.items
  SET status = 'trading',
      locked_by = NULL,
      locked_until = NULL
  WHERE id = target_item_id;

  SELECT COALESCE(nickname, '購入者')
  INTO buyer_nickname
  FROM public.profiles
  WHERE user_id = target_buyer_id;

  message_text := COALESCE(
    NULLIF(TRIM(auto_message), ''),
    COALESCE(buyer_nickname, '購入者') || 'さんから購入リクエストが届きました。チャットで受け渡し日時や場所を相談してください。'
  );

  INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
  VALUES (target_item_id, transaction_id, target_buyer_id, item_record.seller_id, message_text, false);

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES (
    item_record.seller_id,
    'purchase_request',
    '購入相談が届きました',
    '「' || item_record.title || '」に購入リクエストが届きました。',
    'chat',
    target_item_id::text || '?tx=' || transaction_id::text,
    false
  );

  RETURN transaction_id;
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

CREATE OR REPLACE FUNCTION public.complete_handover_by_scan(
  target_transaction_id UUID,
  token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  item_title TEXT;
  actor_id UUID := auth.uid();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT t.*, i.title AS item_title
  INTO tx_record
  FROM public.transactions t
  JOIN public.items i ON i.id = t.item_id
  WHERE t.id = target_transaction_id
  FOR UPDATE;

  IF tx_record.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  IF public.is_current_user_app_review_demo() AND tx_record.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only complete demo transactions';
  END IF;

  IF actor_id IS DISTINCT FROM tx_record.buyer_id THEN
    RAISE EXCEPTION 'only the buyer can complete the handover by scan';
  END IF;

  IF tx_record.status = 'awaiting_rating'
     OR (tx_record.buyer_completed AND tx_record.seller_completed) THEN
    RETURN TRUE;
  END IF;

  IF tx_record.status NOT IN ('accepted', 'scheduling', 'scheduled', 'pending', 'confirmed') THEN
    RAISE EXCEPTION 'handover is not available for current transaction status';
  END IF;

  IF tx_record.handover_token IS NULL
     OR tx_record.handover_token IS DISTINCT FROM token
     OR tx_record.handover_token_expires_at IS NULL
     OR tx_record.handover_token_expires_at < NOW() THEN
    RAISE EXCEPTION 'invalid or expired handover token';
  END IF;

  item_title := tx_record.item_title;

  PERFORM set_config('app.bypass_transaction_update_guard', 'on', true);

  UPDATE public.transactions
  SET buyer_completed = TRUE,
      seller_completed = TRUE,
      buyer_completed_at = COALESCE(buyer_completed_at, NOW()),
      seller_completed_at = COALESCE(seller_completed_at, NOW()),
      status = 'awaiting_rating',
      handover_completion_method = 'qr',
      handover_completed_at = NOW(),
      handover_token = NULL,
      handover_token_expires_at = NULL
  WHERE id = tx_record.id;

  INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
  VALUES (
    tx_record.item_id,
    tx_record.id,
    tx_record.buyer_id,
    tx_record.seller_id,
    '【受け渡し完了】' || chr(10) || chr(10) ||
      'QRコードの読み取りにより、商品の受け渡しが完了しました。' || chr(10) ||
      'お互いの評価をお願いします。',
    false
  );

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES
    (
      tx_record.buyer_id,
      'transaction_completed',
      '取引が完了しました',
      '「' || COALESCE(item_title, '商品') || '」の受け渡しが完了しました。評価をお願いします。',
      'chat',
      tx_record.item_id::text || '?tx=' || tx_record.id::text,
      false
    ),
    (
      tx_record.seller_id,
      'transaction_completed',
      '取引が完了しました',
      '「' || COALESCE(item_title, '商品') || '」の受け渡しが完了しました。評価をお願いします。',
      'chat',
      tx_record.item_id::text || '?tx=' || tx_record.id::text,
      false
    );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_handover_forgotten(
  target_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  updated_tx RECORD;
  actor_id UUID := auth.uid();
  is_buyer BOOLEAN := FALSE;
  receiver_id UUID;
  actor_already_completed BOOLEAN := FALSE;
  item_title TEXT;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT t.*, i.title AS item_title
  INTO tx_record
  FROM public.transactions t
  JOIN public.items i ON i.id = t.item_id
  WHERE t.id = target_transaction_id
  FOR UPDATE;

  IF tx_record.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  IF actor_id NOT IN (tx_record.buyer_id, tx_record.seller_id) THEN
    RAISE EXCEPTION 'only transaction participants can complete handover';
  END IF;

  IF public.is_current_user_app_review_demo() AND tx_record.is_demo IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'app review accounts can only complete demo transactions';
  END IF;

  IF tx_record.status = 'awaiting_rating' THEN
    RETURN jsonb_build_object(
      'alreadyAwaitingRating', TRUE,
      'bothCompleted', TRUE,
      'transactionId', tx_record.id,
      'notifyUserId', NULL
    );
  END IF;

  IF tx_record.status NOT IN ('accepted', 'scheduling', 'scheduled', 'pending', 'confirmed') THEN
    RAISE EXCEPTION 'handover is not available for current transaction status';
  END IF;

  is_buyer := actor_id = tx_record.buyer_id;
  receiver_id := CASE WHEN is_buyer THEN tx_record.seller_id ELSE tx_record.buyer_id END;
  actor_already_completed := CASE WHEN is_buyer THEN tx_record.buyer_completed ELSE tx_record.seller_completed END;
  item_title := tx_record.item_title;

  PERFORM set_config('app.bypass_transaction_update_guard', 'on', true);

  IF is_buyer THEN
    UPDATE public.transactions
    SET buyer_completed = TRUE,
        buyer_completed_at = COALESCE(buyer_completed_at, NOW()),
        handover_token = NULL,
        handover_token_expires_at = NULL
    WHERE id = tx_record.id
    RETURNING * INTO updated_tx;
  ELSE
    UPDATE public.transactions
    SET seller_completed = TRUE,
        seller_completed_at = COALESCE(seller_completed_at, NOW()),
        handover_token = NULL,
        handover_token_expires_at = NULL
    WHERE id = tx_record.id
    RETURNING * INTO updated_tx;
  END IF;

  IF updated_tx.buyer_completed AND updated_tx.seller_completed THEN
    UPDATE public.transactions
    SET status = 'awaiting_rating',
        handover_completion_method = 'forget',
        handover_completed_at = NOW(),
        handover_token = NULL,
        handover_token_expires_at = NULL
    WHERE id = tx_record.id
    RETURNING * INTO updated_tx;

    INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
    VALUES (
      tx_record.item_id,
      tx_record.id,
      actor_id,
      receiver_id,
      '【受け渡し完了】' || chr(10) || chr(10) ||
        '双方の取引終了確認が完了しました。評価をお願いします。',
      false
    );

    INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
    VALUES (
      receiver_id,
      'transaction_completed',
      '評価をお願いします',
      '「' || COALESCE(item_title, '商品') || '」の受け渡し確認が完了しました。評価をお願いします。',
      'chat',
      tx_record.item_id::text || '?tx=' || tx_record.id::text,
      false
    );

    RETURN jsonb_build_object(
      'bothCompleted', TRUE,
      'transactionId', tx_record.id,
      'itemId', tx_record.item_id,
      'notifyUserId', receiver_id,
      'method', 'forget'
    );
  END IF;

  IF NOT actor_already_completed THEN
    INSERT INTO public.messages(item_id, transaction_id, sender_id, receiver_id, message, is_read)
    VALUES (
      tx_record.item_id,
      tx_record.id,
      actor_id,
      receiver_id,
      '【取引終了確認】' || chr(10) || chr(10) ||
        '取引終了が押されました。' || chr(10) || chr(10) ||
        '取引が終了したことが確認できれば、右上から【取引終了→正常に取引終了できなかった場合はこちら】へ進み取引を終了させてください。',
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'bothCompleted', FALSE,
    'transactionId', tx_record.id,
    'itemId', tx_record.item_id,
    'notifyUserId', receiver_id,
    'method', 'forget'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_demo_transaction(UUID, UUID, TEXT, TEXT[], TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_purchase_request(UUID, TEXT, TEXT[], TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_transaction_rating(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_handover_by_scan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_handover_forgotten(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
