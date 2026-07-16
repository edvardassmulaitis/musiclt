-- ============================================================
-- 2026-07-16 — Wiki album list scout (punktas B)
-- ============================================================
-- Tikslas: stebėti Wikipedia „List of YYYY albums" (ir panašius metinius
-- sąrašus) kaip papildomą muzikos atradimo šaltinį, mirror'inant news/events
-- scout architektūrą (scout_sources + scout_seen_urls + savo candidate lentelė).
--
-- Skiriasi nuo events_candidates dviem dalykais:
--   1) Rows neturi savo URL (visos eilutės gyvena tame pačiame list puslapyje) —
--      dedupe per fingerprint = sha1(artist|album|year-month-day), kaip
--      event_candidates.fingerprint.
--   2) SĄMONINGAS DIZAINO PATIKSLINIMAS vs. pradinis planas (MUSIC_DISCOVERY_
--      AUTOMATION_PLAN.md §B.2, kuris siūlė tiesiog reuse'inti scout_seen_urls):
--      čia NENAUDOJAM scout_seen_urls tam, kad "seen" niekada nebūtų galutinis —
--      albumas dažnai patenka į sąrašą BE savo Wikipedia straipsnio (album_wiki_
--      link=NULL), o straipsnis atsiranda savaitėmis vėliau. Jei fingerprint'as
--      būtų "seen" amžinai po pirmo pamatymo, re-scan niekad nepastebėtų, kad
--      album_wiki_link atsirado. Vietoj to: wiki_album_candidates PATS yra
--      dedupe šaltinis (UNIQUE fingerprint), o scout endpoint'as gali UPDATE'inti
--      egzistuojantį 'pending' įrašą, kai naujas scrape atneša album_wiki_link,
--      kurio anksčiau nebuvo (žr. app/api/internal/wiki-album-scout/run/route.ts).
-- ============================================================

-- 1) scout_sources.category — pridėti 'wiki_list' (analogiška pastaba kaip
--    planuota A punkte 'yt_artist_channel' CHECK constraint blokeriui).
ALTER TABLE public.scout_sources DROP CONSTRAINT IF EXISTS scout_sources_category_check;
ALTER TABLE public.scout_sources
  ADD CONSTRAINT scout_sources_category_check
  CHECK (category IN ('news_lt','news_intl','tickets','artist_social','wiki_list'));

-- 2) Wiki album candidates queue
CREATE TABLE IF NOT EXISTS public.wiki_album_candidates (
  id BIGSERIAL PRIMARY KEY,

  source_id     BIGINT REFERENCES public.scout_sources(id) ON DELETE SET NULL,
  source_url    TEXT,                            -- pats list puslapis (visoms eilutėms tas pats)

  -- Struktūriniai laukai iš wikitext eilutės
  artist_raw      TEXT NOT NULL,                  -- išvalytas atlikėjo vardas, kaip parašyta Wiki
  album_title     TEXT NOT NULL,
  album_wiki_link TEXT,                           -- Wikipedia page title (jei albumas jau turi savo straipsnį); NULL kol neatsiranda
  release_year    INTEGER NOT NULL,
  release_month   INTEGER NOT NULL,
  release_day     INTEGER NOT NULL,
  genres_raw      TEXT[] DEFAULT '{}',
  label_raw       TEXT,

  -- Entity match
  matched_artist_id BIGINT REFERENCES public.artists(id) ON DELETE SET NULL,
  match_score       NUMERIC(3,2),

  -- Dedupe (žr. komentarą aukščiau — TAI yra pagrindinis dedupe raktas, ne scout_seen_urls)
  fingerprint TEXT NOT NULL,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','approved','rejected','duplicate','error')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  reject_reason TEXT,

  published_album_id INTEGER REFERENCES public.albums(id) ON DELETE SET NULL,

  rescanned_at TIMESTAMPTZ,                       -- kada paskutinį kartą scout'as matė šią eilutę (link'o atsiradimo detekcijai)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wiki_album_candidates_fingerprint
  ON public.wiki_album_candidates (fingerprint);

CREATE INDEX IF NOT EXISTS idx_wiki_album_candidates_status_created
  ON public.wiki_album_candidates (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_album_candidates_artist
  ON public.wiki_album_candidates (matched_artist_id)
  WHERE matched_artist_id IS NOT NULL;

-- 3) Seed scout_sources — „List of 2026 albums" pagrindinis puslapis.
--    parser_key unikalus per metus, kad ateityje (2027) galėtume tiesiog
--    pridėti naują eilutę be konflikto.
INSERT INTO public.scout_sources
  (name, category, feed_url, list_url, parser_key, fetch_interval_min, notes)
VALUES
  ('Wikipedia: List of 2026 albums', 'wiki_list', NULL,
   'https://en.wikipedia.org/wiki/List_of_2026_albums',
   'wiki_album_list_2026', 1440,
   'Punktas B — metinis albumų sąrašas, month-by-month wikitable. 1x/parą pakanka (ne skubu).')
ON CONFLICT (parser_key) DO NOTHING;
