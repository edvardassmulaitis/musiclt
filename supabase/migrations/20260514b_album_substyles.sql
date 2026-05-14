-- ============================================================
-- 2026-05-14b — album_substyles junction lentelė
-- ============================================================
-- Tikslas: leisti laikyti per-album substyles (Wikipedia infobox
-- `| genre = ...` ekvivalentą). Iki šiol substyles gyveno tik atlikėjo
-- lygyje (artist_substyles), bet konkretus albumas gali turėti SAVO
-- žanrus, kurie nesutampa su bendrais atlikėjo žanrais (pvz. a-ha
-- „Memorial Beach" — alternative rock, nors atlikėjas synth-pop).
--
-- Mirror'inam artist_substyles patterną:
--   - id BIGSERIAL PK
--   - (album_id, substyle_id) UNIQUE
--   - CASCADE delete'ai į abi puses
--   - RLS: read public, write admin/super_admin
--
-- Saugu: nauja lentelė, jokie esami duomenys nepaliesti.

BEGIN;

CREATE TABLE IF NOT EXISTS public.album_substyles (
    id BIGSERIAL PRIMARY KEY,
    album_id BIGINT NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
    substyle_id BIGINT NOT NULL REFERENCES public.substyles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT album_substyles_unique UNIQUE (album_id, substyle_id)
);

CREATE INDEX IF NOT EXISTS idx_album_substyles_album
    ON public.album_substyles (album_id);

CREATE INDEX IF NOT EXISTS idx_album_substyles_substyle
    ON public.album_substyles (substyle_id);

COMMENT ON TABLE public.album_substyles IS
  'Per-album substyles (žanrai). Užpildoma per Wikipedia importą (parseAlbumGenres) ar manualiai admin UI.';

-- ── RLS — read'as public, write'as tik admin/super_admin ─────────────
ALTER TABLE public.album_substyles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON public.album_substyles;
CREATE POLICY "public read" ON public.album_substyles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin write" ON public.album_substyles;
CREATE POLICY "admin write" ON public.album_substyles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'super_admin')
        )
    );

COMMIT;
