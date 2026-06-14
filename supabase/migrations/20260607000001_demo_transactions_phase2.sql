ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_transaction_created
ON public.messages(transaction_id, created_at);

COMMENT ON COLUMN public.messages.transaction_id IS 'Optional transaction thread id. Added for demo/Phase 2 thread separation; legacy messages may be null.';

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

CREATE OR REPLACE FUNCTION public.validate_message_insert()
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.item_id = NEW.item_id
      AND (
        (t.buyer_id = NEW.sender_id AND t.seller_id = NEW.receiver_id)
        OR
        (t.seller_id = NEW.sender_id AND t.buyer_id = NEW.receiver_id)
      )
      AND t.status IN (
        'requested', 'accepted', 'scheduling', 'scheduled', 'awaiting_rating',
        'completed', 'cancelled', 'rejected', 'expired', 'auto_closed',
        'pending_approval', 'pending', 'confirmed', 'declined'
      )
  ) THEN
    RAISE EXCEPTION 'message participants do not match transaction';
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_demo_transaction(UUID, UUID, TEXT, TEXT[], TEXT[], TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
