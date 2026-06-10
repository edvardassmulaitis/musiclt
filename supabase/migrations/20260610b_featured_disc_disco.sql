-- 2026-06-10b: featured („Dėmesio centre") praplėtimas — diskusijos ir muzikos
-- atradimai irgi gali būti featured /atrasti viršuje. PRITAIKYTA per Mgmt API.

alter table discussions add column if not exists featured_until timestamptz;
alter table discoveries add column if not exists featured_until timestamptz;
