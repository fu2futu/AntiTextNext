CREATE INDEX IF NOT EXISTS idx_site_access_hourly_visitors_hash_last_seen
ON public.site_access_hourly_visitors(visitor_hash, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.increment_site_access(
  target_visitor_hash TEXT,
  target_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hour_start TIMESTAMPTZ := DATE_TRUNC('hour', target_time);
  recent_access_hour TIMESTAMPTZ;
BEGIN
  IF target_visitor_hash IS NULL OR LENGTH(TRIM(target_visitor_hash)) < 16 THEN
    RETURN;
  END IF;

  SELECT access_hour
  INTO recent_access_hour
  FROM public.site_access_hourly_visitors
  WHERE visitor_hash = target_visitor_hash
    AND last_seen_at >= target_time - INTERVAL '6 hours'
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF recent_access_hour IS NOT NULL THEN
    UPDATE public.site_access_hourly_visitors
    SET last_seen_at = NOW(),
        view_count = public.site_access_hourly_visitors.view_count + 1
    WHERE access_hour = recent_access_hour
      AND visitor_hash = target_visitor_hash;
    RETURN;
  END IF;

  INSERT INTO public.site_access_hourly_visitors(access_hour, visitor_hash, view_count, first_seen_at, last_seen_at)
  VALUES (hour_start, target_visitor_hash, 1, NOW(), NOW())
  ON CONFLICT (access_hour, visitor_hash)
  DO UPDATE SET
    view_count = public.site_access_hourly_visitors.view_count + 1,
    last_seen_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_site_access(TEXT, TIMESTAMPTZ) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
