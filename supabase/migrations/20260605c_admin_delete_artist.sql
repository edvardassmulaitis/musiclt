-- 20260605c_admin_delete_artist.sql
-- VISIŠKAS atlikėjo ištrynimas (admin) — vienoje transakcijoje. Naudojama
-- /admin/radaras „🗑 Ištrinti" (žr. /api/admin/radar/delete). Skirta šiukšlėms /
-- klaidingiems įrašams pašalinti VISAI (ne tik paslėpti).
--
-- Saugumas: plpgsql funkcija = atominė. Jei kuri nors priklausomybė neištrinama
-- (praleista NO ACTION FK), VISA operacija rollback'inasi ir grąžina klaidą —
-- niekada nepalieka pusiau ištrinto atlikėjo.
--
-- Tvarkomi NO ACTION blokeriai (žr. FK auditą):
--   tracks → top_votes/top_entries/top_suggestions/manual_top_entries/
--            daily_song_votes/daily_song_winners
--   albums → manual_top_entries
--   artists → forum_threads/forum_topics/manual_top_entries/news
-- Likę FK CASCADE arba SET NULL susitvarko patys.

create or replace function admin_delete_artist(aid bigint)
returns jsonb
language plpgsql
security definer
as $$
declare
  tids bigint[];
  albs bigint[];
  n_tracks int := 0;
  n_albums int := 0;
begin
  select array_agg(id) into tids from tracks where artist_id = aid;
  select array_agg(id) into albs from albums where artist_id = aid;
  n_tracks := coalesce(array_length(tids, 1), 0);
  n_albums := coalesce(array_length(albs, 1), 0);

  -- ── track NO ACTION blokeriai ──
  if tids is not null then
    delete from top_votes            where track_id = any(tids);
    delete from top_suggestions      where track_id = any(tids);
    delete from top_entries          where track_id = any(tids);
    delete from manual_top_entries   where track_id = any(tids);
    delete from daily_song_votes     where track_id = any(tids);
    delete from daily_song_winners   where track_id = any(tids);
    delete from likes                where entity_type = 'track' and entity_id = any(tids);
  end if;

  -- ── album NO ACTION blokeriai ──
  if albs is not null then
    delete from manual_top_entries   where album_id = any(albs);
    delete from likes                where entity_type = 'album' and entity_id = any(albs);
  end if;

  -- ── artist NO ACTION blokeriai ──
  delete from forum_threads     where artist_id = aid;
  delete from forum_topics      where artist_id = aid;
  delete from manual_top_entries where artist_id = aid;
  update news set artist_id  = null where artist_id  = aid;
  update news set artist_id2 = null where artist_id2 = aid;
  delete from likes where entity_type = 'artist' and entity_id = aid;

  -- ── turinys + atlikėjas (likusios FK cascade/SET NULL) ──
  delete from tracks  where artist_id = aid;
  delete from albums  where artist_id = aid;
  delete from artists where id = aid;

  return jsonb_build_object('ok', true, 'deleted_tracks', n_tracks, 'deleted_albums', n_albums);
end;
$$;
