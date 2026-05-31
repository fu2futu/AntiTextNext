-- QR受け渡し確認による取引完了フロー
-- 出品者がQRを表示し、購入者がスキャンすることで「両者が対面で受け渡しを行った」ことを確認する。
-- スキャン1回で両者完了 → status='awaiting_rating' に進め、評価へ移行する。
-- 既存の手動完了（buyer_completed/seller_completed を個別に立てる方式）はフォールバックとして温存。

-- 1) 受け渡しトークン用カラム
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS handover_token text,
  ADD COLUMN IF NOT EXISTS handover_token_expires_at timestamptz;

-- 2) 出品者がQR用トークンを発行する
--    役割固定: 表示できるのは出品者(seller_id)のみ。
CREATE OR REPLACE FUNCTION public.generate_handover_token(
  target_transaction_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx_record RECORD;
  actor_id UUID := auth.uid();
  new_token TEXT;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT *
  INTO tx_record
  FROM public.transactions
  WHERE id = target_transaction_id
  FOR UPDATE;

  IF tx_record.id IS NULL THEN
    RAISE EXCEPTION 'transaction not found';
  END IF;

  -- QRの表示（トークン発行）は出品者のみ
  IF actor_id IS DISTINCT FROM tx_record.seller_id THEN
    RAISE EXCEPTION 'only the seller can generate a handover token';
  END IF;

  -- 進行中の取引でのみ発行可能（手動完了ボタンの許可ステータスに合わせる）
  IF tx_record.status NOT IN ('accepted', 'scheduling', 'scheduled', 'pending', 'confirmed') THEN
    RAISE EXCEPTION 'handover is not available for current transaction status';
  END IF;

  new_token := replace(gen_random_uuid()::text, '-', '');

  UPDATE public.transactions
  SET handover_token = new_token,
      handover_token_expires_at = NOW() + INTERVAL '4 minutes'
  WHERE id = tx_record.id;

  RETURN new_token;
END;
$$;

-- 3) 購入者がQRをスキャンして取引を完了する
--    役割固定: スキャンによる完了は購入者(buyer_id)のみ（＝発行者の出品者は自分のQRでは完了不可）。
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

  -- スキャンによる完了は購入者のみ
  IF actor_id IS DISTINCT FROM tx_record.buyer_id THEN
    RAISE EXCEPTION 'only the buyer can complete the handover by scan';
  END IF;

  -- 冪等性: 既に完了済みなら no-op で成功を返す（二重スキャンでも評価へ進めるように）
  IF tx_record.status = 'awaiting_rating'
     OR (tx_record.buyer_completed AND tx_record.seller_completed) THEN
    RETURN TRUE;
  END IF;

  IF tx_record.status NOT IN ('accepted', 'scheduling', 'scheduled', 'pending', 'confirmed') THEN
    RAISE EXCEPTION 'handover is not available for current transaction status';
  END IF;

  -- トークン検証（単回・期限つき）
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
      status = 'awaiting_rating',
      handover_token = NULL,
      handover_token_expires_at = NULL
  WHERE id = tx_record.id;

  -- チャットへシステムメッセージ（購入者→出品者）
  INSERT INTO public.messages(item_id, sender_id, receiver_id, message, is_read)
  VALUES (
    tx_record.item_id,
    tx_record.buyer_id,
    tx_record.seller_id,
    '【受け渡し完了】' || chr(10) || chr(10) ||
      'QRコードの読み取りにより、商品の受け渡しが完了しました。' || chr(10) ||
      'お互いの評価をお願いします。',
    false
  );

  -- 双方へ通知
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

GRANT EXECUTE ON FUNCTION public.generate_handover_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_handover_by_scan(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
