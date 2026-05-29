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
BEGIN
  IF p_buyer_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'authentication_required');
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT public.is_user_operational(auth.uid()) THEN
    RAISE EXCEPTION 'account is restricted';
  END IF;

  SELECT id, title, seller_id, status, locked_by, locked_until
  INTO item_record
  FROM public.items
  WHERE id = target_item_id
  FOR UPDATE;

  IF item_record.id IS NULL THEN
    RAISE EXCEPTION 'item not found';
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
    status
  )
  VALUES (
    target_item_id,
    auth.uid(),
    item_record.seller_id,
    payment_method,
    meetup_time_slots,
    meetup_locations,
    'accepted'
  )
  RETURNING id INTO transaction_id;

  INSERT INTO public.purchase_request_history(item_id, buyer_id, seller_id, status)
  VALUES (target_item_id, auth.uid(), item_record.seller_id, 'accepted');

  UPDATE public.items
  SET status = 'trading',
      locked_by = NULL,
      locked_until = NULL
  WHERE id = target_item_id;

  INSERT INTO public.messages(item_id, sender_id, receiver_id, message, is_read)
  VALUES (target_item_id, auth.uid(), item_record.seller_id, auto_message, false);

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

CREATE OR REPLACE FUNCTION public.cancel_consultation_and_reopen_item(
  target_transaction_id UUID,
  reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  actor_id UUID := auth.uid();
  receiver_id UUID;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF reason IS NULL OR LENGTH(TRIM(reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT t.*, i.status AS item_status, i.title
  INTO tx_record
  FROM public.transactions t
  JOIN public.items i ON i.id = t.item_id
  WHERE t.id = target_transaction_id
  FOR UPDATE;

  IF tx_record.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  IF actor_id NOT IN (tx_record.buyer_id, tx_record.seller_id) THEN
    RAISE EXCEPTION 'only transaction participants can cancel';
  END IF;

  IF tx_record.status NOT IN ('requested', 'accepted', 'scheduling', 'scheduled') THEN
    RAISE EXCEPTION 'transaction cannot be reopened from current status';
  END IF;

  receiver_id := CASE WHEN actor_id = tx_record.buyer_id THEN tx_record.seller_id ELSE tx_record.buyer_id END;

  PERFORM set_config('app.bypass_transaction_update_guard', 'on', true);

  UPDATE public.transactions
  SET status = 'cancelled',
      cancellation_reason = TRIM(reason),
      cancelled_at = NOW()
  WHERE id = tx_record.id;

  UPDATE public.items
  SET status = 'available',
      locked_by = NULL,
      locked_until = NULL
  WHERE id = tx_record.item_id
    AND status IN ('trading', 'transaction_pending');

  INSERT INTO public.messages(item_id, sender_id, receiver_id, message, is_read)
  VALUES (
    tx_record.item_id,
    actor_id,
    receiver_id,
    '【相談が終了しました】' || chr(10) || chr(10) ||
      '別の方との相談に切り替えるため、このチャットは終了しました。' || chr(10) ||
      '理由: ' || TRIM(reason) || chr(10) || chr(10) ||
      '不当だと感じる場合は、マイページのお問い合わせから運営へご連絡ください。',
    false
  );

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES (
    receiver_id,
    'transaction_cancelled',
    '購入相談が終了しました',
    '「' || tx_record.title || '」の購入相談が終了しました。理由はチャットで確認できます。不当だと感じる場合はお問い合わせください。',
    'chat',
    tx_record.item_id::text || '?tx=' || tx_record.id::text,
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_purchase_eligibility(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_purchase_request(UUID, TEXT, TEXT[], TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_consultation_and_reopen_item(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
