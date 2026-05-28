-- ============================================================
-- 2026-05-28c — Architectural Slim Down: drop denormalized + analytics + legacy junk
-- ============================================================
--
-- Tikslas: sumažinti DB nuo 644 MB → ~400 MB drop'inant nereikalingus
-- stulpelius iš didžiausių lentelių. Tai NE tik bloat cleanup'as — tai
-- architektūrinis fix'as kad ateityje (scrape'inant likusius 97% atlikėjų)
-- DB augimo greitis būtų ~5× mažesnis.
--
-- Pagrindiniai principai:
-- 1. Profile metadata (avatar_url, rank) — saugoma TIK profiles lentelėje,
--    ne dubliuojama per kiekvieną like'ą.
-- 2. Analytics junk (user_agent) — niekur app'e nenaudojamas, drop.
-- 3. Constant/default columns (source='auth') — drop.
-- 4. HTML versija kai turim plain text — drop (renderiam runtime).
-- 5. Migration helper columns (legacy_thread_legacy_id) — drop po unify'o.
--
-- Šis cleanup'as toks pat saugus kaip Phase 1 — tiesiog DROP COLUMN.
-- Po jo BŪTINA VACUUM FULL ant tų lentelių (reclaim space iš dropped columns).
-- VACUUM FULL daromas atskirai (negali būti TX'e), žr. apačioj.
--
-- ⚠️ ANTRA: prieš paleidžiant šitą migraciją būtina pataisyti app/scrape
-- kodą, kad nebebandytų SELECT/INSERT'inti į drop'intus laukus. Žr. commit
-- aprašymą — kuriame parodyta visi pakeitimai per code base.

BEGIN;

-- ============================================================
-- 0. PROFILES — pridėti rank stulpelį, kad būtų vienoje vietoje
-- ============================================================
-- Anksčiau music.lt user rank ("Naujokas", "Mėgėjas", etc.) buvo
-- saugomas KIEKVIENAME like row'e (denormalized). Dabar perkeliam į
-- profiles, kur vienam useriui = vienas row. Galimas savings ~10 MB.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rank TEXT;

-- Migrate'inam rank iš likes į profiles. Imam pirmą non-null per username.
-- (rank dažniausiai vienodas visiem like'am to paties userio)
UPDATE public.profiles p
SET rank = sub.user_rank
FROM (
  SELECT DISTINCT ON (user_username) user_username, user_rank
  FROM public.likes
  WHERE user_rank IS NOT NULL
  ORDER BY user_username, created_at DESC
) sub
WHERE LOWER(p.username) = LOWER(sub.user_username)
  AND p.rank IS NULL;

-- ============================================================
-- 1. LIKES — drop denormalized profile + analytics + constant
-- ============================================================
-- Anksčiau: 13 kolonų, ~424 baitai per row × 562K = 228 MB
-- Po drop: 7 kolonų, ~130 baitų per row × 562K ≈ 73 MB (~150 MB sutaupymo)

-- user_avatar_url, user_rank: denormalized iš profiles. Fetch'inam JOIN'u.
-- Atnaujinta UI kodas naudoja `profiles!likes_user_id_fkey(avatar_url, rank)`.
ALTER TABLE public.likes DROP COLUMN IF EXISTS user_avatar_url;
ALTER TABLE public.likes DROP COLUMN IF EXISTS user_rank;

-- user_agent: anon detection metadata. Niekur app'e nenaudojamas
-- (grep'as patvirtino — nei UI, nei API endpoint'as nereferencuoja).
-- Ghost users (legacy_scrape) avg 250 baitų per row — pure waste.
ALTER TABLE public.likes DROP COLUMN IF EXISTS user_agent;

-- source: 99%+ rows = 'auth', kitaip — galima inferred iš user_id IS NULL
-- (anon ghost). Tik logging'ui ir niekur app filter'iui nereikalinga.
ALTER TABLE public.likes DROP COLUMN IF EXISTS source;

-- rating: 1-5 star rating ant likes (legacy feature iš artist_likes lentelės).
-- Niekur UI'e neeksponuojamas, score formulose ne'naudojamas.
ALTER TABLE public.likes DROP COLUMN IF EXISTS rating;

-- entity_legacy_id PALIEKAM — vis dar reikalingas migration phase
-- placeholder logic'ai (kai entity_id=NULL, sortinam ir resolve'inam pagal
-- entity_legacy_id + entity_type). Po pilno migracijos galima drop'inti
-- atskira Phase 3 migracija.

-- ============================================================
-- 1b. EVENT_ATTENDEES — tas pats denormalization problem kaip likes
-- ============================================================
-- Same fields, same architectural sprendimas: profile metadata → JOIN.
ALTER TABLE public.event_attendees DROP COLUMN IF EXISTS user_avatar_url;
ALTER TABLE public.event_attendees DROP COLUMN IF EXISTS user_rank;
ALTER TABLE public.event_attendees DROP COLUMN IF EXISTS user_agent;
ALTER TABLE public.event_attendees DROP COLUMN IF EXISTS source;

-- ============================================================
-- 2. COMMENTS — drop HTML duplicate + migration helper
-- ============================================================
-- Anksčiau: 17 kolonų, ~500 baitų per row × 236K = 119 MB
-- Po drop: 15 kolonų, ~350 baitų per row × 236K ≈ 83 MB (~36 MB sutaupymo)

-- content_html: HTML versija to paties content kuris yra body kolone.
-- App kodas (lib/comments-ts) naudoja body field. HTML rich format'as
-- (link'ai, bold, italic) renderiam runtime per BBCode → HTML converter.
ALTER TABLE public.comments DROP COLUMN IF EXISTS content_html;

-- legacy_thread_legacy_id: PALIEKAM — vis dar aktyviai naudojamas
-- atlikėjo puslapio paskutiniems comments per forum thread bridge'ą.
-- Po pilno forum_threads → discussions migracijos galima drop'inti
-- atskira Phase 3 migracija (kai visi UI references atnaujinti į
-- discussion_id FK).

COMMIT;

-- ============================================================
-- 3. VACUUM FULL — reclaim physical space + rebuild indexes
-- ============================================================
-- ⚠️ VACUUM FULL ima exclusive lock, blokuoja read/write ant tos lentelės.
-- ⚠️ NEGALI būti transaction'oj — todėl COMMIT'as jau buvo aukščiau.
-- ⚠️ Šie reikia paleisti VIENA UŽ KITĄ kad neperkrautume connection pool'o.
--
-- Tvarka: mažiausia → didžiausia (kad jei vienas užstrigtų, prieš tai
-- mažesnės jau bus optimised).

VACUUM FULL public.comments;
VACUUM FULL public.likes;

-- Tracks paliekam Phase 3 (jis 102 MB, bet jokios kolonos nedrop'inom —
-- VACUUM FULL tik 8% bloat cleanup, ne worth tos lock'inimo dabar).

-- ============================================================
-- POST-MIGRATION CHECKS (paleisti rankiniu būdu po šio file'o):
-- ============================================================
--
-- 1. DB size check:
--    SELECT pg_size_pretty(pg_database_size(current_database()));
--    Tikslas: ~400 MB (iš 644 MB)
--
-- 2. Likes lentelės size check:
--    SELECT pg_size_pretty(pg_total_relation_size('public.likes'));
--    Tikslas: ~80 MB (iš 228 MB)
--
-- 3. Comments lentelės size check:
--    SELECT pg_size_pretty(pg_total_relation_size('public.comments'));
--    Tikslas: ~85 MB (iš 119 MB)
--
-- 4. Verify drop'inti columns nebeegzistuoja:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='likes';
