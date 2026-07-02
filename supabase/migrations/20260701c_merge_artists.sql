-- 20260701c_merge_artists.sql
--
-- Atlikėjų dublikatų valymas. artists.slug NĖRA unikalus (~94 dublikatai).
-- merge_artists saugiai sujungia du atlikėjus: perkelia VISAS nuorodas
-- (~45 FK stulpelių + polimorfinius likes/entity_comments) iš loser į keeper,
-- sutvarko junction dublikatus/susikirtimus, tada HARD-delete'ina loser'į.
-- Transakcinis (funkcija) — bet koks sutrikimas atšaukia viską. tracks/albums
-- neturi (artist_id,slug) unique → susikertančios dainos lieka po keeper'iu ir
-- tvarkomos esamu /admin/duplikatai dainų įrankiu.

create table if not exists public.artist_merges (
  id bigserial primary key,
  keeper_id bigint not null, loser_id bigint not null,
  loser_name text, loser_slug text, loser_snapshot jsonb,
  merged_by uuid references public.profiles(id) on delete set null,
  merged_at timestamptz not null default now()
);

create or replace function public.merge_artists(p_keeper bigint, p_loser bigint, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $FN$
declare
  v_loser public.artists%rowtype;
  v_likes_moved int := 0;
begin
  if p_keeper is null or p_loser is null then raise exception 'keeper/loser required'; end if;
  if p_keeper = p_loser then raise exception 'keeper equals loser'; end if;
  select * into v_loser from public.artists where id = p_loser;
  if not found then raise exception 'loser % not found', p_loser; end if;
  if not exists (select 1 from public.artists where id = p_keeper) then raise exception 'keeper % not found', p_keeper; end if;

  -- ── JUNCTION lentelės: dedupe (ištrinam susikertančias loser eilutes) → repoint ──
  delete from public.album_artists l where l.artist_id = p_loser and exists (select 1 from public.album_artists k where k.artist_id = p_keeper and k.album_id = l.album_id);
  update public.album_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.track_artists l where l.artist_id = p_loser and exists (select 1 from public.track_artists k where k.artist_id = p_keeper and k.track_id = l.track_id);
  update public.track_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_genres l where l.artist_id = p_loser and exists (select 1 from public.artist_genres k where k.artist_id = p_keeper and k.genre_id = l.genre_id);
  update public.artist_genres set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_substyles l where l.artist_id = p_loser and exists (select 1 from public.artist_substyles k where k.artist_id = p_keeper and k.substyle_id = l.substyle_id);
  update public.artist_substyles set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_links l where l.artist_id = p_loser and exists (select 1 from public.artist_links k where k.artist_id = p_keeper and k.platform = l.platform);
  update public.artist_links set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_follows l where l.artist_id = p_loser and exists (select 1 from public.artist_follows k where k.artist_id = p_keeper and k.user_id = l.user_id);
  update public.artist_follows set artist_id = p_keeper where artist_id = p_loser;
  delete from public.profile_favorite_artists l where l.artist_id = p_loser and exists (select 1 from public.profile_favorite_artists k where k.artist_id = p_keeper and k.user_id = l.user_id);
  update public.profile_favorite_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.blog_post_artists l where l.artist_id = p_loser and exists (select 1 from public.blog_post_artists k where k.artist_id = p_keeper and k.post_id = l.post_id);
  update public.blog_post_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.news_artists l where l.artist_id = p_loser and exists (select 1 from public.news_artists k where k.artist_id = p_keeper and k.news_id = l.news_id);
  update public.news_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.reportage_artists l where l.artist_id = p_loser and exists (select 1 from public.reportage_artists k where k.artist_id = p_keeper and k.reportage_id = l.reportage_id);
  update public.reportage_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.event_artists l where l.artist_id = p_loser and exists (select 1 from public.event_artists k where k.artist_id = p_keeper and k.event_id = l.event_id);
  update public.event_artists set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_photos l where l.artist_id = p_loser and exists (select 1 from public.artist_photos k where k.artist_id = p_keeper and k.url = l.url);
  update public.artist_photos set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_social_connections l where l.artist_id = p_loser and exists (select 1 from public.artist_social_connections k where k.artist_id = p_keeper and k.platform = l.platform);
  update public.artist_social_connections set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_team l where l.artist_id = p_loser and exists (select 1 from public.artist_team k where k.artist_id = p_keeper and k.profile_id = l.profile_id);
  update public.artist_team set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_eras l where l.artist_id = p_loser and exists (select 1 from public.artist_eras k where k.artist_id = p_keeper and k.title = l.title and k.year_start = l.year_start);
  update public.artist_eras set artist_id = p_keeper where artist_id = p_loser;
  delete from public.wiki_single_ignores l where l.artist_id = p_loser and exists (select 1 from public.wiki_single_ignores k where k.artist_id = p_keeper and k.wiki_title = l.wiki_title);
  update public.wiki_single_ignores set artist_id = p_keeper where artist_id = p_loser;

  -- ── artist_claims: partial unique (artist_id, profile_id) WHERE pending ──
  delete from public.artist_claims l where l.artist_id = p_loser and l.status = 'pending'
     and exists (select 1 from public.artist_claims k where k.artist_id = p_keeper and k.profile_id = l.profile_id and k.status = 'pending');
  update public.artist_claims set artist_id = p_keeper where artist_id = p_loser;

  -- ── artist_contacts: unique (artist_id, type, lower(email)) WHERE email not null ──
  delete from public.artist_contacts l where l.artist_id = p_loser and l.email is not null
     and exists (select 1 from public.artist_contacts k where k.artist_id = p_keeper and k.type = l.type and lower(k.email) = lower(l.email));
  update public.artist_contacts set artist_id = p_keeper where artist_id = p_loser;

  -- ── artist_related (du atlikėjų stulpeliai) ──
  delete from public.artist_related l where l.related_artist_id = p_loser and exists (select 1 from public.artist_related k where k.related_artist_id = p_keeper and k.artist_id = l.artist_id);
  update public.artist_related set related_artist_id = p_keeper where related_artist_id = p_loser;
  delete from public.artist_related l where l.artist_id = p_loser and exists (select 1 from public.artist_related k where k.artist_id = p_keeper and k.related_artist_id = l.related_artist_id);
  update public.artist_related set artist_id = p_keeper where artist_id = p_loser;
  delete from public.artist_related where artist_id = related_artist_id;

  -- ── artist_members (member_id, group_id) ──
  update public.artist_members set member_id = p_keeper where member_id = p_loser;
  update public.artist_members set group_id  = p_keeper where group_id  = p_loser;
  delete from public.artist_members where member_id = group_id;

  -- ── LIKES (entity_type='artist') — perkelti su dedup ──
  insert into public.likes (entity_type, entity_id, entity_legacy_id, user_id, user_username, anon_id, created_at)
  select entity_type, p_keeper, entity_legacy_id, user_id, user_username, anon_id, created_at
  from public.likes where entity_type = 'artist' and entity_id = p_loser
  on conflict (entity_type, entity_id, user_username) do nothing;
  get diagnostics v_likes_moved = row_count;
  delete from public.likes where entity_type = 'artist' and entity_id = p_loser;

  -- Legacy-only likes (entity_id NULL, keyed per entity_legacy_id = loser.legacy_id)
  -- — priskiriam keeper'iui (dedup per user_username).
  if v_loser.legacy_id is not null then
    delete from public.likes l where l.entity_type = 'artist' and l.entity_id is null
       and l.entity_legacy_id = v_loser.legacy_id
       and exists (select 1 from public.likes k where k.entity_type = 'artist' and k.entity_id = p_keeper and k.user_username = l.user_username);
    update public.likes set entity_id = p_keeper
      where entity_type = 'artist' and entity_id is null and entity_legacy_id = v_loser.legacy_id;
  end if;

  -- ── PAPRASTI repoint'ai ──
  update public.albums set artist_id = p_keeper where artist_id = p_loser;
  update public.tracks set artist_id = p_keeper where artist_id = p_loser;
  update public.news set artist_id = p_keeper where artist_id = p_loser;
  update public.news set artist_id2 = p_keeper where artist_id2 = p_loser;
  update public.discussions set artist_id = p_keeper where artist_id = p_loser;
  update public.discussions set artist_id2 = p_keeper where artist_id2 = p_loser;
  update public.listings set artist_id = p_keeper where artist_id = p_loser;
  update public.concert_recordings set artist_id = p_keeper where artist_id = p_loser;
  update public.external_chart_entries set artist_id = p_keeper where artist_id = p_loser;
  update public.forum_threads set artist_id = p_keeper where artist_id = p_loser;
  update public.forum_topics set artist_id = p_keeper where artist_id = p_loser;
  update public.discoveries set artist_id = p_keeper where artist_id = p_loser;
  update public.chart_resolution_memory set artist_id = p_keeper where artist_id = p_loser;
  update public.event_candidates set primary_artist_id = p_keeper where primary_artist_id = p_loser;
  update public.news_candidates set primary_artist_id = p_keeper where primary_artist_id = p_loser;
  update public.news_candidates set fallback_image_artist_id = p_keeper where fallback_image_artist_id = p_loser;
  update public.boombox_video_drops set related_artist_id = p_keeper where related_artist_id = p_loser;
  update public.artist_breaks set artist_id = p_keeper where artist_id = p_loser;
  update public.artist_imports set artist_id = p_keeper where artist_id = p_loser;
  update public.artist_social_embeds set artist_id = p_keeper where artist_id = p_loser;
  update public.artist_social_items set artist_id = p_keeper where artist_id = p_loser;
  update public.artist_updates set artist_id = p_keeper where artist_id = p_loser;
  update public.reportage_photos set artist_id = p_keeper where artist_id = p_loser;
  update public.reportages set artist_id = p_keeper where artist_id = p_loser;
  update public.manual_top_entries set artist_id = p_keeper where artist_id = p_loser;
  update public.voting_participants set artist_id = p_keeper where artist_id = p_loser;
  update public.blog_posts set target_artist_id = p_keeper where target_artist_id = p_loser;

  update public.news        set artist_id2 = null where artist_id2 = artist_id;
  update public.discussions set artist_id2 = null where artist_id2 = artist_id;

  update public.artists set score = greatest(coalesce(score,0), coalesce(v_loser.score,0)) where id = p_keeper;

  insert into public.artist_merges (keeper_id, loser_id, loser_name, loser_slug, loser_snapshot, merged_by)
  values (p_keeper, p_loser, v_loser.name, v_loser.slug, to_jsonb(v_loser), p_actor);

  delete from public.artists where id = p_loser;

  return jsonb_build_object('ok', true, 'keeper', p_keeper, 'loser', p_loser, 'likes_moved', v_likes_moved);
end $FN$;

revoke all on function public.merge_artists(bigint, bigint, uuid) from public;
grant execute on function public.merge_artists(bigint, bigint, uuid) to service_role;

