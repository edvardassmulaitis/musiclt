-- 20260604d_skelbimai_seed_source.sql
--
-- Seed'ams iš išorinių saitų (skelbiu.lt, paslaugos.lt, muzikantų grupės):
--   • source_url  — nuoroda į originalą (rodom „Žiūrėti originalą →" vietoj DM)
--   • source_name — šaltinio pavadinimas (pvz „skelbiu.lt")
--   • is_seed     — pažymi seed'ą (galima vėliau masiškai pašalinti/filtruoti)
--
-- Seed'ai priskiriami sistemos „ghost" profiliui (žemiau), nes author_id NOT NULL.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS source_url  text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS is_seed     boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_is_seed ON public.listings (is_seed) WHERE is_seed = true;

-- Sistemos profilis seed'ams (idempotentiška: fiksuotas UUID). Be username
-- (uq_profiles_username_lower jau turi 'musiclt').
INSERT INTO public.profiles (id, email, full_name, role, provider)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'seed@music.lt', 'music.lt', 'user', 'system')
ON CONFLICT (id) DO NOTHING;
