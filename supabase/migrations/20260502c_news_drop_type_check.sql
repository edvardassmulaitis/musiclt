-- Pašalinti `news_type_check` constraint'ą iš `news` lentelės.
--
-- Problema: news.type column'as turi CHECK constraint'ą su fix'inta enum verte
-- (pvz. type IN ('news', 'review', 'interview', 'report')). Bet admin UI'as
-- (`app/admin/news/[id]/page.tsx`) leidžia kurti naujus types per
-- `/api/news-types` (į `news_types` lentelę). Kai admin'as pasirenka custom type
-- — INSERT'as fail'ina su:
--   "new row for relation 'news' violates check constraint 'news_type_check'"
--
-- Sprendimas: drop check constraint'ą. `news_types` lentelė tampa dinamine
-- types listo šaltiniu. Vėliau gali pridėti FK reference jei nori griežtumo,
-- bet tam reiks data migracijos egzistuojantiems news rows.

ALTER TABLE news DROP CONSTRAINT IF EXISTS news_type_check;

-- Sanity: jei norėsi turėti FK į news_types, pirma reikės įsitikinti, kad
-- visi egzistuojantys news.type yra news_types.slug values, tada paleisti:
--   ALTER TABLE news ADD CONSTRAINT news_type_fk
--     FOREIGN KEY (type) REFERENCES news_types(slug) ON UPDATE CASCADE;
-- (Nepalikta active'inta — pirmas tegul user'is paleidžia šitą migraciją be
-- FK ir patikrina, ar news kūrimas veikia.)
