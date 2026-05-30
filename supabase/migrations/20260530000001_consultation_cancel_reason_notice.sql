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
  actor_is_seller BOOLEAN;
  reason_text TEXT := TRIM(COALESCE(reason, ''));
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF reason_text IS NULL OR LENGTH(reason_text) < 3 THEN
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

  actor_is_seller := actor_id = tx_record.seller_id;
  receiver_id := CASE WHEN actor_id = tx_record.buyer_id THEN tx_record.seller_id ELSE tx_record.buyer_id END;

  PERFORM set_config('app.bypass_transaction_update_guard', 'on', true);

  UPDATE public.transactions
  SET status = 'cancelled',
      cancellation_reason = reason_text,
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
    CASE
      WHEN actor_is_seller THEN '【相談が終了しました】'
      ELSE '【購入リクエストが取り下げられました】'
    END || chr(10) || chr(10) ||
      CASE
        WHEN actor_is_seller THEN '出品者がこの相談を終了し、商品を再公開しました。'
        ELSE '購入希望者がリクエストを取り下げ、商品は再公開されました。'
      END || chr(10) ||
      '理由: ' || reason_text || chr(10) || chr(10) ||
      '不当だと感じる場合は、マイページのお問い合わせから運営へご連絡ください。',
    false
  );

  INSERT INTO public.notifications(user_id, type, title, message, link_type, link_id, is_read)
  VALUES (
    receiver_id,
    'transaction_cancelled',
    CASE
      WHEN actor_is_seller THEN '購入相談が終了しました'
      ELSE '購入リクエストが取り下げられました'
    END,
    '「' || tx_record.title || '」の' ||
      CASE
        WHEN actor_is_seller THEN '購入相談が終了しました。'
        ELSE '購入リクエストが取り下げられました。'
      END ||
      '理由: ' || reason_text ||
      '。不当だと感じる場合はお問い合わせください。',
    'chat',
    tx_record.item_id::text || '?tx=' || tx_record.id::text,
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_consultation_and_reopen_item(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
