-- 20260701b_reportage_blog_link.sql
--
-- News triage admin (Thread C, 3 etapas): recenzija ↔ galerija.
--
-- KONTEKSTAS (patikrinta gyvai 2026-07-01):
--   • `reportages` jau turi `legacy_discussion_id` — ryšį į legacy RECENZIJA
--     `discussions` įrašą. Iš 70 galerijų 40 susietos būtent su recenzijomis.
--   • Trūksta ryšio į NARIŲ ĮRAŠĄ (blog_posts), sukurtą per triage konversiją,
--     kad galerija ir jos recenzija būtų dvipusiai susietos viešai
--     (galerijoje → „skaityti recenziją", recenzijoje → „nuotraukos").
--
-- Ši migracija nieko netrina — prideda vieną nullable FK stulpelį. Idempotentiška.

alter table public.reportages
  add column if not exists blog_post_id uuid
    references public.blog_posts(id) on delete set null;

create index if not exists idx_reportages_blog_post
  on public.reportages(blog_post_id)
  where blog_post_id is not null;
