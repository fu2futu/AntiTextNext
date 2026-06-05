-- Local cache of ISBN -> academic subject (学院/系) classification.
-- Source of truth is the isct syllabus DB (a separate Supabase project); rows here are
-- populated by /api/subjects/sync calling the isct /api/public/isbn-subjects endpoint.
-- One ISBN can map to several (school, dept) pairs when a book is used across systems.

CREATE TABLE IF NOT EXISTS public.book_subjects (
  isbn        TEXT NOT NULL CHECK (isbn ~ '^97[89][0-9]{10}$'),
  school      TEXT NOT NULL,   -- 学院 e.g. 工学院
  dept        TEXT NOT NULL,   -- 系キー e.g. MEC
  dept_label  TEXT NOT NULL,   -- 系の日本語名 e.g. 機械系
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (isbn, school, dept)
);

CREATE INDEX IF NOT EXISTS idx_book_subjects_school ON public.book_subjects(school);
CREATE INDEX IF NOT EXISTS idx_book_subjects_dept   ON public.book_subjects(dept);

ALTER TABLE public.book_subjects ENABLE ROW LEVEL SECURITY;

-- Subject classification is non-sensitive: anyone may read. Writes go through the
-- service_role (sync route), which bypasses RLS, so no INSERT/UPDATE policy is granted.
GRANT SELECT ON public.book_subjects TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'book_subjects'
      AND policyname = 'Anyone can read book subjects'
  ) THEN
    CREATE POLICY "Anyone can read book subjects"
    ON public.book_subjects
    FOR SELECT
    USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
