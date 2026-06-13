ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS handover_completion_method TEXT,
ADD COLUMN IF NOT EXISTS handover_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS buyer_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS seller_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_handover_completion_method_check'
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_handover_completion_method_check
    CHECK (
      handover_completion_method IS NULL
      OR handover_completion_method IN ('qr', 'forget')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_handover_completion_method
ON public.transactions(handover_completion_method)
WHERE handover_completion_method IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_transaction_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_transaction_update_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

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
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] 取引が完了しました' ELSE '取引が完了しました' END,
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] ' ELSE '' END || '「' || COALESCE(item_title, '商品') || '」の受け渡しが完了しました。評価をお願いします。',
      'chat',
      tx_record.item_id::text || '?tx=' || tx_record.id::text,
      false
    ),
    (
      tx_record.seller_id,
      'transaction_completed',
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] 取引が完了しました' ELSE '取引が完了しました' END,
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] ' ELSE '' END || '「' || COALESCE(item_title, '商品') || '」の受け渡しが完了しました。評価をお願いします。',
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
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] 評価をお願いします' ELSE '評価をお願いします' END,
      CASE WHEN COALESCE(tx_record.is_demo, FALSE) THEN '[デモ] ' ELSE '' END || '「' || COALESCE(item_title, '商品') || '」の受け渡し確認が完了しました。評価をお願いします。',
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

GRANT EXECUTE ON FUNCTION public.complete_handover_by_scan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_handover_forgotten(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
