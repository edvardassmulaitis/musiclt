-- Renginiams pridedame `is_festival` žymą — leidžia filtruoti festivalius
-- atskirai nuo įprastų koncertų. Iki šios migracijos kodas naudoja euristiką
-- (pavadinimo raktažodžiai + kelių dienų trukmė); po apply'o ir admin žymėjimo
-- pirmenybę turi šis stulpelis.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_festival BOOLEAN NOT NULL DEFAULT false;

-- Dalinis indeksas — filtras renginių puslapyje ima tik is_festival = true.
CREATE INDEX IF NOT EXISTS idx_events_is_festival
  ON public.events (is_festival)
  WHERE is_festival = true;

COMMENT ON COLUMN public.events.is_festival IS
  'Ar renginys yra festivalis (rodomas „Festivaliai" filtre ir /festivaliai puslapyje).';
