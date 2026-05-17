-- ============================================================
-- 2026-05-18 — News candidate image attachments
-- ============================================================
-- Tikslas: saugoti foto attachment'us iš press release email'ų kartu su
-- jų metadata (autorius, copyright, metai). Foto failas talpinamas
-- Supabase Storage bucket'e 'news-attachments', o čia laikom referencę
-- + EXIF-extracted metadata + admin'o overrides.
--
-- Worker flow:
--   gmail-ingest endpoint'as gauna attachments[] iš SKILL.md task'o
--   → base64 decode → upload į Storage → exifr extract → INSERT eilutę.
--
-- Approve flow (PATCH /api/admin/news-candidates/{id} action='approve'):
--   first row (sort_order=0) → news.image_title_url/image_small_url (hero)
--   sort_order 1..4 → news.image1_url..image4_url
--
-- Reject flow (DELETE):
--   news_candidates ON DELETE CASCADE trina šitas eilutes.
--   Atskirai endpoint'as išvalo Storage failus (Supabase neturi storage
--   ON DELETE trigger'io).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.news_candidate_images (
  id              BIGSERIAL PRIMARY KEY,
  candidate_id    INTEGER NOT NULL REFERENCES public.news_candidates(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,             -- 'gmail/{candidate_id}/{filename}' (bucket-relative)
  public_url      TEXT NOT NULL,             -- pilnas viešas URL (Supabase getPublicUrl rezultatas)
  filename        TEXT,                      -- originalus failo vardas iš email'o
  mime_type       TEXT,                      -- 'image/jpeg' etc.
  file_size       INTEGER,                   -- baitais

  -- EXIF-extracted metadata (gali būti NULL jei nepavyko)
  photographer    TEXT,                      -- EXIF Artist / Creator
  copyright       TEXT,                      -- EXIF Copyright field
  year_taken      SMALLINT,                  -- iš DateTimeOriginal (tik metai)
  caption_exif    TEXT,                      -- EXIF ImageDescription jei yra

  -- Admin'o overrides (UI'uje gali pataisyti prieš approve)
  caption         TEXT,                      -- final caption (admin'o per UI; default = caption_exif)
  photographer_override TEXT,                -- admin'o override (default = photographer)
  copyright_override    TEXT,                -- admin'o override (default = copyright)
  year_override   SMALLINT,                  -- admin'o override (default = year_taken)

  source          TEXT NOT NULL DEFAULT 'email_attachment'
                  CHECK (source IN ('email_attachment','manual','auto_picked')),
  sort_order      SMALLINT NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_candidate_images_candidate
  ON public.news_candidate_images (candidate_id, sort_order);

COMMENT ON TABLE public.news_candidate_images IS
  'Press release email attachments — foto + EXIF metadata. Approve metu mapuojami i news.image_*. Reject trina cascade.';

-- ─────────────────────────────────────────────────────────────
-- Supabase Storage bucket'as 'news-attachments' (public read)
-- ─────────────────────────────────────────────────────────────
-- INSERT ignorinama jei bucket'as jau egzistuoja. RLS atviram read'ui:
-- public select per anon role; insert/delete tik service_role (kuriam
-- public.gmail-ingest endpoint'as naudoja).

INSERT INTO storage.buckets (id, name, public)
VALUES ('news-attachments', 'news-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read (anyone can fetch files by URL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'news-attachments public read'
  ) THEN
    EXECUTE 'CREATE POLICY "news-attachments public read" ON storage.objects FOR SELECT USING (bucket_id = ''news-attachments'')';
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────
-- gmail_seen_messages: pridėti filter_reason='admin_rejected' option'ą
-- ─────────────────────────────────────────────────────────────
-- Schema turi TEXT field'ą be CHECK, todėl reikšmė tiesiog veiks. Komentaras
-- atnaujinamas dokumentavimui:

COMMENT ON COLUMN public.gmail_seen_messages.filter_reason IS
  $$Atmetimo priezastis: NULL=priimta, 'not_music'=Haiku, 'sonnet_rejected'=Sonnet, 'admin_rejected'=admin per /inbox$$;
