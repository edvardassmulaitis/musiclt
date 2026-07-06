-- 2026-07-06 — Rate limiting store (fixed-window skaitliukas).
--
-- Naudojama abuse apsaugai (magic-link email bomb, AI cost drain, paieškos DoS,
-- UGC spam). Atominis check-and-increment per RPC. Tik service_role pasiekia
-- (RLS įjungtas, be politikų → anon/authenticated negali).

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.rate_limits enable row level security;
-- Jokių politikų — tik service_role (kuris apeina RLS) rašo/skaito per RPC.

-- Grąžina TRUE jei leidžiama (skaitliukas <= p_max einamame lange), FALSE jei viršyta.
create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_sec int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into public.rate_limits(key, window_start, count)
    values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case
          when public.rate_limits.window_start < v_now - make_interval(secs => p_window_sec)
          then 1 else public.rate_limits.count + 1 end,
        window_start = case
          when public.rate_limits.window_start < v_now - make_interval(secs => p_window_sec)
          then v_now else public.rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- Retkarčiais išvalyti senus įrašus (paleisti per cron arba rankiniu būdu).
create or replace function public.rate_limit_gc(p_older_than_sec int default 86400)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - make_interval(secs => p_older_than_sec);
$$;
