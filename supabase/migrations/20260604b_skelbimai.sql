-- 20260604b_skelbimai.sql
--
-- Skelbimai — bendruomenės prekyvietė / ryšių lenta music.lt viduje.
-- Vienas `listings` storage'as visiems 4 tipams (ploksteles | instrumentai |
-- paslaugos | rysiai). 1 etape UI'e įjungti tik `rysiai` ir `paslaugos`
-- (be inventoriaus → greitai prisipildo), bet schema nuo pradžių dengia
-- visus keturis, kad 2–4 etapų nereiktų migruoti iš naujo.
--
-- Sprendimai (žr. SKELBIMAI_ETAPAS1_PLANAS.md):
--   • Kontaktas = vidinės žinutės (esama chat sistema) → kontakto stulpelių
--     nėra; „Susisiekti" sukuria DM per chat. Paliktas `contact_method`
--     kabliukas ateičiai (jei kada rodysim tiesioginį kontaktą).
--   • Featured = hibridas: `is_promoted` + `promoted_until` (admin pinned),
--     likę slotai auto pagal naujumą. Tas pats laukas = būsimo mokamo
--     iškėlimo kabliukas (1 etape viskas nemokama).
--
-- API naudoja service-role klientą (createAdminClient), tad RLS = safety net.

-- ── listings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipas — visi keturi nuo pradžių. UI 1 etape rodo tik rysiai/paslaugos.
  type          text NOT NULL CHECK (type IN ('ploksteles','instrumentai','paslaugos','rysiai')),
  -- Potipis (laisvas, prasmė priklauso nuo type):
  --   rysiai:      iesko-grupes-nario | iesko-grupes | bendraautoris |
  --                repeticiju-baze | jamai
  --   paslaugos:   pamokos | irasymas | remontas | miksavimas | repeticiju-baze | kita
  --   instrumentai:gitaros | bosines | bugnai | klavisiniai | puciamieji |
  --                styginiai | garso-technika | priedai
  --   ploksteles:  lp | ep | single | cd | kasete
  subtype       text,

  author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  title         text NOT NULL,
  slug          text,                 -- SEO: title slug; URL = /skelbimai/skelbimas/<id> (slug tik display)
  description   text,

  -- Bendri laukai
  city          text,                 -- fiksuotas sąrašas + 'nuotoliu' (žr. lib/skelbimai.ts CITIES)
  genre         text,                 -- žanras (rysiai/ploksteles)
  photos        text[] NOT NULL DEFAULT '{}',  -- public URL'ai (per /api/upload)

  -- Kaina / įkainis. price_cents = sveikas kainos vienetas centais (NULL = nenurodyta).
  price_cents   integer,
  -- paslaugoms: kaip skaičiuojama kaina — 'val' | 'projektas' | 'menesis' | NULL
  price_unit    text,
  is_free       boolean NOT NULL DEFAULT false,   -- „dovanoju" / nemokama paslauga

  -- ── Tipui specifiniai laukai (schema-ready; pildoma pagal type) ──────────
  -- RYSIAI
  instrument    text,                 -- ieškomas/siūlomas instrumentas (bugnai, basas, vokalas...)
  experience    text,                 -- patirties lygis: pradedantis | vidutinis | patyres | profesionalas
  looking_for   boolean,              -- true = „ieškau", false = „siūlau" (paklausa vs pasiūla)

  -- PLOKSTELES (katalogo prisegimas + būklės)
  artist_id     bigint REFERENCES public.artists(id) ON DELETE SET NULL,
  album_id      bigint REFERENCES public.albums(id) ON DELETE SET NULL,
  format        text,                 -- LP | 7" | CD | kasete
  media_cond    text,                 -- Mint | NM | VG+ | VG | G
  sleeve_cond   text,                 -- Mint | NM | VG+ | VG | G
  release_year  integer,
  release_country text,
  catalog_no    text,

  -- INSTRUMENTAI
  brand         text,
  model         text,
  item_cond     text,                 -- naujas | kaip-naujas | geras | naudotas | remontui
  item_year     integer,

  -- ── Būsena / matomumas ───────────────────────────────────────────────────
  -- active = matomas; reserved = rezervuotas; closed = parduota/užpildyta/neaktualu;
  -- expired = pasibaigęs; hidden = admin paslėpė (moderacija).
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','reserved','closed','expired','hidden')),

  -- Hibridinis featured + būsimas mokamas iškėlimas.
  is_promoted   boolean NOT NULL DEFAULT false,
  promoted_until timestamptz,

  -- Ateičiai (1 etape visada 'chat'): kaip rodom kontaktą.
  contact_method text NOT NULL DEFAULT 'chat',  -- chat | phone | email

  view_count    integer NOT NULL DEFAULT 0,
  save_count    integer NOT NULL DEFAULT 0,

  expires_at    timestamptz,          -- auto-expiry (NULL = neribota); pratęsiama UI'e
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Sąrašo užklausos: tipas + būsena + naujumas (pagrindinis listing index).
CREATE INDEX IF NOT EXISTS idx_listings_type_status_created
  ON public.listings (type, status, created_at DESC);
-- Featured (hibridas): pinned pirmi.
CREATE INDEX IF NOT EXISTS idx_listings_promoted
  ON public.listings (is_promoted, created_at DESC) WHERE status = 'active';
-- Mano skelbimai.
CREATE INDEX IF NOT EXISTS idx_listings_author
  ON public.listings (author_id, created_at DESC);
-- Filtrai.
CREATE INDEX IF NOT EXISTS idx_listings_subtype ON public.listings (type, subtype) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_city    ON public.listings (city) WHERE status = 'active';
-- Portalo integracija: „parduodami šio atlikėjo/albumo įrašai".
CREATE INDEX IF NOT EXISTS idx_listings_artist  ON public.listings (artist_id) WHERE status = 'active' AND artist_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_listings_album   ON public.listings (album_id)  WHERE status = 'active' AND album_id IS NOT NULL;

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
-- Public gali skaityti aktyvius skelbimus (SEO/SSR per anon klientą jei kada);
-- rašymas tik per service-role API.
DROP POLICY IF EXISTS listings_public_read ON public.listings;
CREATE POLICY listings_public_read ON public.listings
  FOR SELECT USING (status = 'active');

-- ── listing_saves (Įsiminti) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.listing_saves (
  listing_id  uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_listing_saves_user
  ON public.listing_saves (user_id, created_at DESC);

ALTER TABLE public.listing_saves ENABLE ROW LEVEL SECURITY;

-- save_count denormalizacija: trigger'is sinchronizuoja listings.save_count.
CREATE OR REPLACE FUNCTION public._sync_listing_save_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.listings SET save_count = save_count + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.listings SET save_count = GREATEST(0, save_count - 1) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listing_saves_count ON public.listing_saves;
CREATE TRIGGER trg_listing_saves_count
  AFTER INSERT OR DELETE ON public.listing_saves
  FOR EACH ROW EXECUTE FUNCTION public._sync_listing_save_count();

-- updated_at auto-touch.
CREATE OR REPLACE FUNCTION public._touch_listing_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_touch ON public.listings;
CREATE TRIGGER trg_listings_touch
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public._touch_listing_updated_at();

-- ── Counts pagal tipą (hub plytelėms) ────────────────────────────────────────
-- Tuščių kategorijų nerodom viešai → hub'as naudoja šituos skaičius.
CREATE OR REPLACE FUNCTION public.listings_counts_by_type()
RETURNS TABLE (type text, n bigint)
LANGUAGE sql STABLE AS $$
  SELECT type, count(*)::bigint AS n
  FROM public.listings
  WHERE status = 'active'
  GROUP BY type;
$$;
