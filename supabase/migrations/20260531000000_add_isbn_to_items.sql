-- Add an optional ISBN-13 to items so listings can be matched to specific textbooks.
-- Used by the /textbooks bulk lookup that receives ISBNs from the isct campus app.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS isbn text;

-- Only allow a normalized 13-digit ISBN (978/979 prefix) or NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_isbn_format_chk'
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_isbn_format_chk
      CHECK (isbn IS NULL OR isbn ~ '^97[89][0-9]{10}$');
  END IF;
END $$;

-- Index for the bulk `isbn IN (...)` lookup on the textbooks page.
CREATE INDEX IF NOT EXISTS idx_items_isbn
  ON public.items(isbn)
  WHERE isbn IS NOT NULL;
