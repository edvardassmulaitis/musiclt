-- ────────────────────────────────────────────────────────────────────────────
-- Backfill: seno srauto „dalyvavo" žymėjimai (event_attendees) → „Matyti gyvai".
-- Tik praėję renginiai (start_date < now), su atlikėju (headlineris), be dublikatų.
-- user_id resolvinamas per username (event_attendees.user_id visur NULL).
-- source='attendance_import' — kad būtų galima atskirti / atšaukti.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.profile_seen_live add column if not exists source text;

insert into public.profile_seen_live (user_id, artist_id, event_id, seen_year, status, source)
select distinct on (p.id, ea.event_id)
  p.id,
  ha.artist_id,
  ea.event_id,
  extract(year from e.start_date)::int,
  'approved',
  'attendance_import'
from public.event_attendees ea
join public.events e   on e.id = ea.event_id and e.start_date < now()
join public.profiles p on lower(p.username) = lower(ea.user_username)
join lateral (
  select x.artist_id
  from public.event_artists x
  where x.event_id = ea.event_id
  order by x.is_headliner desc nulls last, x.sort_order asc nulls last
  limit 1
) ha on true
where not exists (
  select 1 from public.profile_seen_live s
  where s.user_id = p.id and s.event_id = ea.event_id
)
order by p.id, ea.event_id;
