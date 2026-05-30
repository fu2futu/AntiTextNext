-- Backfill items.isbn for existing listings created before the isbn column existed.
-- Listings made via barcode scan stored their title from book_isbn_cache, so we can
-- recover the ISBN by matching titles back to the cache.
--
-- Safety: only backfill titles that map to EXACTLY ONE isbn in the cache. A title that
-- maps to multiple ISBNs (e.g. different editions sharing a name) is ambiguous and is
-- left NULL rather than guessing. Only rows with isbn IS NULL are touched.

WITH unique_titles AS (
  SELECT trim(title) AS title, min(isbn) AS isbn
  FROM public.book_isbn_cache
  WHERE title IS NOT NULL AND trim(title) <> ''
  GROUP BY trim(title)
  HAVING count(DISTINCT isbn) = 1
)
UPDATE public.items AS i
SET isbn = u.isbn
FROM unique_titles AS u
WHERE i.isbn IS NULL
  AND trim(i.title) = u.title;
