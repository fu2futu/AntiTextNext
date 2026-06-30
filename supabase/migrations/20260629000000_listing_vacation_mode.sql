-- 出品の「おやすみモード」: 出品者本人が自分の出品をまとめて一時停止／再開できる機能。
-- 留学・長期不在などで一時的に受け渡しができないケースを想定。
--
-- 設計:
--   * 一括停止の対象は status = 'available' の出品のみ。
--     取引中(trading / transaction_pending)・売却済み(sold)・削除済み(deleted)には一切触れない。
--   * 再開時に「この一括停止で止めた分だけ」を正確に元へ戻すため、items.vacation_paused でマークする。
--     個別に一時停止していた出品（vacation_paused = false のまま）は再開対象から除外される。
--   * おやすみ中かどうかの真偽値は profiles.listings_paused_at で保持する（NULL なら通常状態）。

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS vacation_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS listings_paused_at TIMESTAMPTZ;

-- 再開時に「自分の vacation_paused な出品」を引くためのインデックス
CREATE INDEX IF NOT EXISTS idx_items_seller_vacation_paused
  ON public.items(seller_id)
  WHERE vacation_paused = true;

-- 個別トグル（商品ページの停止／再開）が vacation_paused を整合させられるよう列単位の更新権限を付与
GRANT UPDATE (vacation_paused) ON public.items TO authenticated;

-- 自分の出品を一括で一時停止する
CREATE OR REPLACE FUNCTION public.pause_my_listings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID := auth.uid();
  paused_count INTEGER := 0;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 販売中の出品だけを停止し、一括停止で止めたことを記録する。
  -- 取引中・売却済み・削除済み・既に個別停止済みのものは対象外。
  UPDATE public.items
  SET status = 'paused',
      vacation_paused = true
  WHERE seller_id = current_uid
    AND status = 'available';
  GET DIAGNOSTICS paused_count = ROW_COUNT;

  UPDATE public.profiles
  SET listings_paused_at = NOW()
  WHERE user_id = current_uid;

  RETURN jsonb_build_object(
    'pausedCount', paused_count
  );
END;
$$;

-- 一括停止した自分の出品を再開する
CREATE OR REPLACE FUNCTION public.resume_my_listings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_uid UUID := auth.uid();
  resumed_count INTEGER := 0;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 一括停止で止めた(status が 'paused' のままの)出品だけを販売中へ戻す。
  -- 個別停止していた出品(vacation_paused = false)は触らない。
  UPDATE public.items
  SET status = 'available',
      vacation_paused = false
  WHERE seller_id = current_uid
    AND vacation_paused = true
    AND status = 'paused';
  GET DIAGNOSTICS resumed_count = ROW_COUNT;

  -- 念のため、status が他へ遷移していた残りのフラグもクリアしておく。
  UPDATE public.items
  SET vacation_paused = false
  WHERE seller_id = current_uid
    AND vacation_paused = true;

  UPDATE public.profiles
  SET listings_paused_at = NULL
  WHERE user_id = current_uid;

  RETURN jsonb_build_object(
    'resumedCount', resumed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pause_my_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_my_listings() TO authenticated;

NOTIFY pgrst, 'reload schema';
