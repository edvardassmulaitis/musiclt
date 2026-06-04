-- 20260604c_skelbimai_kita_type.sql
--
-- Pridedam 5-ą skelbimų tipą „kita" (atributika, gaidos, plakatai, kolekcijos).
-- skelbiu.lt turi „Kita" kategoriją — atspindim taksonomiją. Tipas schema-ready,
-- UI'e 1 etape dar „greitai" (live:false lib/skelbimai.ts).

ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_type_check;
ALTER TABLE public.listings ADD CONSTRAINT listings_type_check
  CHECK (type IN ('ploksteles','instrumentai','paslaugos','rysiai','kita'));
