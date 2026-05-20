ALTER TABLE public.user_badges
ADD COLUMN IF NOT EXISTS badge_color TEXT NOT NULL DEFAULT 'red'
  CHECK (badge_color IN ('yellow', 'green', 'sky', 'navy', 'red', 'admin'));

COMMENT ON COLUMN public.user_badges.badge_color IS 'Display color for the book-shaped badge. Matches avatar frame tones except white.';

NOTIFY pgrst, 'reload schema';
