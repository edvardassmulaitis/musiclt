-- 20260716_home_feed_key_per_kind.sql
--
-- BUG (gyvai aptikta 2026-07-16, žr. Justin Timberlake atvejį /admin/feed):
-- `home_feed_item_key_uidx` (20260621_home_feed.sql) buvo unique index ant
-- VIEN item_key stulpelio — GLOBALUS per visus `kind` reikšmes. Bet realiai
-- 'override' (admin hide/pin/sort) ir 'candidate' (cron feed-candidates
-- registracija/patvirtinimas) yra du VISIŠKAI NEPRIKLAUSOMI dalykai, kurie
-- turi bendrą item_key raktų erdvę tik dėl patogumo — visos užklausos jau ir
-- taip filtruoja pagal `kind` (žr. /api/admin/feed, /api/feed/overrides,
-- /api/admin/feed/candidates, /api/cron/feed-candidates).
--
-- Kadangi cron kas 30 min užregistruoja BEVEIK KIEKVIENĄ auto-tipo įrašą
-- (news/event/recording/verta) kaip kind='candidate', tokia eilutė beveik
-- visada jau egzistuoja tuo metu, kai admin pirmą kartą bando ką nors
-- paslėpti/prisegti /admin/feed puslapyje. INSERT naujai 'override' eilutei
-- su tuo pačiu item_key MUŠDAVOSI į šitą global unique constraint (23505),
-- o /api/admin/feed fallback (UPDATE su .eq('kind','override')) tokį
-- konfliktą matydavo, bet atnaujindavo 0 eilučių IR JOKIOS KLAIDOS
-- NEGRĄŽINDAVO — endpoint'as grąžindavo {ok:true}, hide/pin realiai niekur
-- neišsisaugodavo. Simptomas: admin paslepia renginį, Išsaugoti, refresh —
-- vėl matomas aktyvus (nes tikras override rašas niekada nebuvo sukurtas).
--
-- Pataisymas: unikalumą riboti per (item_key, kind), o ne vien item_key —
-- tada 'override' ir 'candidate' eilutės tam pačiam item_key gali koegzistuoti
-- kaip du atskiri, teisingi rašai, kaip kodas visur ir tikisi.
--
-- Pastaba: 'custom' kind niekada nenustato item_key (lieka NULL), tad šitas
-- pakeitimas jo nepaliečia (`where item_key is not null`).
--
-- /api/admin/feed/route.ts turi papildomą app-level fallback'ą (randa esamą
-- eilutę pagal item_key ir konvertuoja į 'override', jei insert vis tiek
-- susikirstų) — tai apsauga tam atvejui, jei ši migracija dar nepritaikyta;
-- ją pritaikius fallback'as tiesiog niekada nebesuveiks (insert visada pavyks
-- iš karto), taigi šitas SQL saugu paleisti bet kada, nepriklausomai nuo
-- deploy'o eiliškumo.

drop index if exists public.home_feed_item_key_uidx;

create unique index if not exists home_feed_item_key_kind_uidx
  on public.home_feed(item_key, kind)
  where item_key is not null;
