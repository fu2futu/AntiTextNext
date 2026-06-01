CREATE OR REPLACE FUNCTION public.user_purge_own_untransacted_item(
  target_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  transaction_count INTEGER := 0;
  deleted_favorites INTEGER := 0;
  deleted_messages INTEGER := 0;
  deleted_notifications INTEGER := 0;
  deleted_lock_attempts INTEGER := 0;
  deleted_request_history INTEGER := 0;
  deleted_reports INTEGER := 0;
  deleted_flags INTEGER := 0;
  deleted_image_errors INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT id, title, seller_id, status
  INTO item_record
  FROM public.items
  WHERE id = target_item_id
  FOR UPDATE;

  IF item_record.id IS NULL THEN
    RAISE EXCEPTION 'item not found';
  END IF;

  IF item_record.seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only seller can purge own item';
  END IF;

  SELECT COUNT(*)
  INTO transaction_count
  FROM public.transactions
  WHERE item_id = target_item_id;

  IF transaction_count > 0 THEN
    RAISE EXCEPTION 'cannot purge item with transactions';
  END IF;

  DELETE FROM public.favorites WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_favorites = ROW_COUNT;

  DELETE FROM public.messages WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_messages = ROW_COUNT;

  DELETE FROM public.notifications
  WHERE link_id = target_item_id::TEXT
    AND COALESCE(link_type, '') IN ('chat', 'transaction', 'item', 'product');
  GET DIAGNOSTICS deleted_notifications = ROW_COUNT;

  DELETE FROM public.purchase_lock_attempts WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_lock_attempts = ROW_COUNT;

  DELETE FROM public.purchase_request_history WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_request_history = ROW_COUNT;

  DELETE FROM public.reports WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_reports = ROW_COUNT;

  DELETE FROM public.item_moderation_flags WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_flags = ROW_COUNT;

  DELETE FROM public.listing_image_error_logs WHERE item_id = target_item_id;
  GET DIAGNOSTICS deleted_image_errors = ROW_COUNT;

  DELETE FROM public.items WHERE id = target_item_id;

  RETURN jsonb_build_object(
    'itemId', target_item_id,
    'title', item_record.title,
    'sellerId', item_record.seller_id,
    'previousStatus', item_record.status,
    'deletedFavorites', deleted_favorites,
    'deletedMessages', deleted_messages,
    'deletedNotifications', deleted_notifications,
    'deletedLockAttempts', deleted_lock_attempts,
    'deletedRequestHistory', deleted_request_history,
    'deletedReports', deleted_reports,
    'deletedFlags', deleted_flags,
    'deletedImageErrors', deleted_image_errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_purge_own_untransacted_item(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
