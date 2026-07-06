-- 2026-07-06 — Indeksai device-fingerprint anti-cheat užklausoms (vote-guard.ts).
-- Guard'as filtruoja pagal (scope, voter_fingerprint) ir (scope, voter_ip).

create index if not exists idx_top_votes_fp on public.top_votes (week_id, voter_fingerprint);
create index if not exists idx_voting_votes_fp on public.voting_votes (event_id, voter_fingerprint);
create index if not exists idx_voting_votes_ip on public.voting_votes (event_id, voter_ip);
create index if not exists idx_daily_song_votes_fp on public.daily_song_votes (nomination_id, voter_fingerprint);
create index if not exists idx_daily_song_votes_ip on public.daily_song_votes (nomination_id, voter_ip);
