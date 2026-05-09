-- ============================================================
-- 2026-05-02 — RECOVERY: dedupe profilių pagal email + force admin
-- ============================================================
-- Po 2026-05-02 commit'o resolveProfile() galėjo įterpti duplicate eilutę
-- profiles lentelėje (case-sensitive email mismatch'as ant fallback'o).
-- Dėl to:
--   - profiles turi 2 eilutes tam pačiam email'ui (vienas su role='admin',
--     kitas role='user')
--   - signIn callback'as naudoja .single() — kai 2 eilutės, throw → catch
--     → role='user'. Edvardas prarado admin teises.
--
-- Šitas script'as:
--   1. Suranda duplicate profilius pagal email (case-insensitive)
--   2. Iš kiekvienos email grupės palieka EILUTĘ SU 'admin' arba 'super_admin'
--      role; jei nėra — palieka seniausią
--   3. Suagreguoja username, full_name iš ištrintų į išliekančia (jei
--      išliekanti turi NULL)
--   4. Update'ina FK eilutes (blogs, blog_posts) į išlikusi user_id
--   5. Ištrina duplicates
--   6. Pridėjam UNIQUE INDEX (case-insensitive) ant email — kad nebūtų
--      galima sukurti duplicate'ų ateityje
--   7. Force'inam admin_whitelist eilutes — jei email yra whitelist'e ir
--      profile.role nėra admin, set'inam admin
-- ============================================================

-- ── 0. Audit prieš operaciją (informacijai logge) ─────────────────────────
DO $$
DECLARE dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT LOWER(email) FROM public.profiles
    WHERE email IS NOT NULL
    GROUP BY LOWER(email) HAVING COUNT(*) > 1
  ) sub;
  RAISE NOTICE 'Aptikta % duplicate email grupių', dup_count;
END $$;

-- ── 1. Pasirenkam "kanoninę" eilutę kiekvienam dubliuotam email ──────────
-- Prioritetai: super_admin > admin > user; jei lygu — seniausia (created_at)
WITH ranked AS (
  SELECT
    id,
    LOWER(email) AS email_norm,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY
        CASE role
          WHEN 'super_admin' THEN 0
          WHEN 'admin'       THEN 1
          ELSE 2
        END,
        created_at ASC
    ) AS rn
  FROM public.profiles
  WHERE email IS NOT NULL
),
canonical AS (
  SELECT id AS keep_id, email_norm FROM ranked WHERE rn = 1
),
duplicates AS (
  SELECT r.id AS drop_id, c.keep_id
  FROM ranked r
  JOIN canonical c ON r.email_norm = c.email_norm
  WHERE r.rn > 1
)
-- ── 2. Suagreguojam metadata į keep_id (kad neprarastume username) ─────
UPDATE public.profiles p
SET
  username      = COALESCE(p.username,      d.dup_username),
  full_name     = COALESCE(p.full_name,     d.dup_full_name),
  avatar_url    = COALESCE(p.avatar_url,    d.dup_avatar_url),
  bio           = COALESCE(p.bio,           d.dup_bio),
  cover_image_url = COALESCE(p.cover_image_url, d.dup_cover_image_url)
FROM (
  SELECT
    dup.keep_id,
    MAX(p2.username)        AS dup_username,
    MAX(p2.full_name)       AS dup_full_name,
    MAX(p2.avatar_url)      AS dup_avatar_url,
    MAX(p2.bio)             AS dup_bio,
    MAX(p2.cover_image_url) AS dup_cover_image_url
  FROM duplicates dup
  JOIN public.profiles p2 ON p2.id = dup.drop_id
  GROUP BY dup.keep_id
) d
WHERE p.id = d.keep_id;

-- ── 3. Re-point FK'us (blogs, blog_posts) iš drop_id į keep_id ───────────
WITH ranked AS (
  SELECT
    id,
    LOWER(email) AS email_norm,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY
        CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        created_at ASC
    ) AS rn
  FROM public.profiles WHERE email IS NOT NULL
),
canonical AS (SELECT id AS keep_id, email_norm FROM ranked WHERE rn = 1),
duplicates AS (
  SELECT r.id AS drop_id, c.keep_id
  FROM ranked r JOIN canonical c ON r.email_norm = c.email_norm
  WHERE r.rn > 1
)
UPDATE public.blogs b
SET user_id = d.keep_id
FROM duplicates d
WHERE b.user_id = d.drop_id;

WITH ranked AS (
  SELECT
    id, LOWER(email) AS email_norm,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC
    ) AS rn
  FROM public.profiles WHERE email IS NOT NULL
),
canonical AS (SELECT id AS keep_id, email_norm FROM ranked WHERE rn = 1),
duplicates AS (
  SELECT r.id AS drop_id, c.keep_id
  FROM ranked r JOIN canonical c ON r.email_norm = c.email_norm
  WHERE r.rn > 1
)
UPDATE public.blog_posts bp
SET user_id = d.keep_id
FROM duplicates d
WHERE bp.user_id = d.drop_id;

-- ── 4. Trinam duplicate eilutes ───────────────────────────────────────────
WITH ranked AS (
  SELECT
    id, LOWER(email) AS email_norm,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email)
      ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC
    ) AS rn
  FROM public.profiles WHERE email IS NOT NULL
)
DELETE FROM public.profiles
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ── 5. Normalizuojam visus likusius email'us į lowercase ──────────────────
UPDATE public.profiles
   SET email = LOWER(email)
 WHERE email IS NOT NULL AND email <> LOWER(email);

-- ── 6. Pridedam UNIQUE INDEX ant LOWER(email), kad ateityje nebūtų galima
--     sukurti dublikato (case-insensitive) ──────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower_unique
  ON public.profiles (LOWER(email))
  WHERE email IS NOT NULL;

-- ── 7. Force admin role pagal admin_whitelist ────────────────────────────
-- Jei email yra whitelist'e, bet profile.role nėra admin/super_admin —
-- atstatom whitelist role.
UPDATE public.profiles p
SET role = w.role
FROM public.admin_whitelist w
WHERE LOWER(p.email) = LOWER(w.email)
  AND COALESCE(p.role, 'user') NOT IN ('admin', 'super_admin')
  AND w.role IN ('admin', 'super_admin');

-- ── 8. Audit po operacijos ────────────────────────────────────────────────
DO $$
DECLARE total INT; admins INT;
BEGIN
  SELECT COUNT(*) INTO total FROM public.profiles;
  SELECT COUNT(*) INTO admins FROM public.profiles WHERE role IN ('admin','super_admin');
  RAISE NOTICE 'Po cleanup: % profilių, % admin/super_admin', total, admins;
END $$;
