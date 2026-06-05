-- 20260605b_muzikos_atradimai_seed.sql
-- Seed: 14 ekstraktinti atradimai iš temos 128402. Idempotentinis (re-runnable).

begin;

insert into public.discoveries
  (legacy_msg_id, thread_id, author_username, artist_name, track_name, album_name,
   narrative, embed_type, embed_id, spotify_id, resolve_state, is_lt, created_at)
values
  (1031590, 128402, 'Rutonė', 'Perfidious Words', null, null,
   'Grupė vadinasi Perfidious Words, muzikuoja gal nuo 2007. Iš pradžių nurašiau depešams, bet ne — balsas ne Dave''o Gahano.',
   'youtube', 'liwlRBfjXjk', null, 'needs_import', false, '2026-04-10'),
  (1030796, 128402, 'einaras13', 'Верасы', 'Аэробика', 'Музыка для всех',
   'Sovietmečiu žinoma baltarusių roko grupė. Paskutiniame albume — funky disko synthpop su tikrai gerom aranžuotėm.',
   'youtube', 'aECc3s6KiB4', null, 'needs_import', false, '2026-01-10'),
  (1029874, 128402, 'einaras13', 'Turmion Kätilöt', null, null,
   'Energinga, nuotaikinga industrinio metalo grupė iš Suomijos. Nustebau — nei aš jų žinojau, nei music''e jų profilio yra.',
   'spotify_track', '0891uRCvRHGNrkpnGHQHVZ', '0891uRCvRHGNrkpnGHQHVZ', 'needs_import', false, '2025-10-21'),
  (1029843, 128402, 'einaras13', 'The Groundhogs', 'Sad Is The Hunter', null,
   'Sena bliuzroko / hardroko grupė su polinkiu į prog''ą ir psichodeliką. „Sad Is The Hunter" (1972) — labai ekspresyvus rokas.',
   'spotify_track', '14KSGumogwtayF0aYmCaKF', '14KSGumogwtayF0aYmCaKF', 'needs_import', false, '2025-10-18'),
  (1029815, 128402, 'einaras13', 'Device', 'When Love Is Good', '22B3',
   'Trumpai gyvavusi poproko grupė, vienas albumas 22B3 (1986). Turtinga instrumentuotė, atmosfera neša į synthpop''ą. Reikės įkelt į music''ą.',
   'spotify_track', '79F68kGDcwRIF0BHvMnT0n', '79F68kGDcwRIF0BHvMnT0n', 'needs_import', false, '2025-10-17'),
  (1029321, 128402, 'Rutonė', 'Defektas', null, null,
   'LinkMenų fabrike, belaukiant savo pasirodymo, suskambo LABAI gerai. Festivalio line''up''e — grupė „Defektas".',
   'spotify_artist', '4vKNIwX9IuNK5m2DN5fsNh', '4vKNIwX9IuNK5m2DN5fsNh', 'needs_import', true, '2025-09-05'),
  (1029175, 128402, 'einaras13', 'Xasthur', 'The Prison of Mirrors', null,
   'Reels''e išgirdau „The Prison of Mirrors" — 12 min atmosferinio juodmetalio. Vieno amerikiečio projektas, įkvėptas Burzum.',
   'spotify_track', '1XyOp2NySUezomjRilMF7y', '1XyOp2NySUezomjRilMF7y', 'needs_import', false, '2025-08-26'),
  (1029108, 128402, '4Blackberry', null, null, null,
   'YouTube algoritmas leido atrasti jas (visos moterys). Iš kur jos tokios ir kodėl negirdėtos? Skamba LABAI gerai.',
   'youtube', '32RsWAdgPqw', null, 'unresolved', false, '2025-08-19'),
  (1026539, 128402, 'einaras13', 'Hawkwind', 'Dangerous Vision', 'Zones',
   'Studijinis leftover''is, vėliau 1983 kompiliacijoje „Zones". Lengvas melodingumas — labiau Camel ar Alan Parsons nei Hawkwind. Zones nėra music''e.',
   'spotify_track', '5v8LXoiD4V5kOqG2mu4gAU', '5v8LXoiD4V5kOqG2mu4gAU', 'needs_import', false, '2024-06-22'),
  (1026373, 128402, 'einaras13', 'Greenslade', null, 'Large Afternoon',
   'Vienintelis albumas po 8-ojo dešimtmečio — „Large Afternoon" (2000). Titulinė nunešė stogą: erdvūs sintezai, džiazinis prieskonis akorduose.',
   'spotify_track', '6BA5Y4Y46NVk2RHcXgZIZm', '6BA5Y4Y46NVk2RHcXgZIZm', 'needs_import', false, '2024-03-22'),
  (1026302, 128402, 'Rutonė', null, null, null,
   'Originalas man meh, o Spotify pasiūlytas variantas — WOW. Def Leppard versija irgi malonus atradimas. (kover''iai, atlikėją reikia atpažinti)',
   'youtube', 'CqOvc6dClaQ', null, 'unresolved', false, '2024-02-27'),
  (1026109, 128402, 'Alvydas1', 'ZOOP', 'Dominion', null,
   'Pernai progarchivuose 17 vieta, Kenterberio scenos antra. „Dominion" — maloniausias ausiai Kenterberis. Imponuoja melotronas, Hammond''ai, saksofonai.',
   'youtube', 'a2UwJURa3cQ', null, 'needs_import', false, '2024-01-29'),
  (1026068, 128402, 'Sahja', 'AlimkhanOV A.', null, null,
   '(plonas įrašas — tik kanalo nuoroda, bet atlikėjas atpažįstamas)',
   'youtube', '5QJUR-67G-w', null, 'needs_import', false, '2024-01-01'),
  (1025903, 128402, 'einaras13', 'Disciplin A Kitschme', null, 'Nova iznenađenja za nova pokolenja',
   'Per viešnagę Serbijoje sužinojau (orig. Disciplina Kičme). Alternatyvios ir panko muzikos hibridas su aštriu bosu, džiazo ir ska elementais.',
   'spotify_album', '5My6xCa4ovScoqBN6NrWgK', '5My6xCa4ovScoqBN6NrWgK', 'needs_import', false, '2023-09-24')
on conflict (legacy_msg_id) do update set
  narrative = excluded.narrative,
  artist_name = excluded.artist_name,
  track_name = excluded.track_name,
  album_name = excluded.album_name,
  embed_type = excluded.embed_type,
  embed_id = excluded.embed_id,
  spotify_id = excluded.spotify_id,
  is_lt = excluded.is_lt,
  created_at = excluded.created_at;

-- ── Tags ──
delete from public.discovery_tags
  where discovery_id in (select id from public.discoveries where thread_id = 128402);

insert into public.discovery_tags (discovery_id, tag)
select d.id, t.tag from public.discoveries d
join (values
  (1031590, 'darkwave'), (1031590, 'post-punk'),
  (1030796, 'funk'), (1030796, 'disco'), (1030796, 'synthpop'),
  (1029874, 'industrial metal'),
  (1029843, 'blues rock'), (1029843, 'hard rock'), (1029843, 'psychedelic'),
  (1029815, 'pop rock'), (1029815, 'synthpop'),
  (1029321, 'industrial'), (1029321, 'alternative metal'),
  (1029175, 'black metal'), (1029175, 'ambient folk'),
  (1026539, 'space rock'), (1026539, 'prog rock'),
  (1026373, 'prog rock'), (1026373, 'jazz rock'),
  (1026302, 'cover'),
  (1026109, 'Canterbury scene'), (1026109, 'prog rock'),
  (1025903, 'alternative rock'), (1025903, 'post-punk'), (1025903, 'ska'), (1025903, 'jazz')
) as t(msg, tag) on t.msg = d.legacy_msg_id
on conflict do nothing;

-- ── Resolve artist_id prieš esamus artists (case-insensitive name match) ──
update public.discoveries d
   set artist_id = a.id, resolve_state = 'resolved'
  from public.artists a
 where d.thread_id = 128402
   and d.artist_name is not null
   and lower(btrim(a.name)) = lower(btrim(d.artist_name));

-- ── Resolve author_id prieš profiles.username ──
update public.discoveries d
   set author_id = p.id
  from public.profiles p
 where d.thread_id = 128402
   and p.username = d.author_username;

-- ── Pending-artist eilė neišspręstiems (needs_import) ──
delete from public.discovery_pending_artist
  where discovery_id in (select id from public.discoveries where thread_id = 128402);

insert into public.discovery_pending_artist (raw_name, spotify_id, youtube_id, discovery_id)
select d.artist_name, d.spotify_id,
       case when d.embed_type = 'youtube' then d.embed_id end,
       d.id
  from public.discoveries d
 where d.thread_id = 128402
   and d.resolve_state = 'needs_import'
   and d.artist_name is not null;

commit;

-- Patikra:
--   select resolve_state, count(*) from discoveries where thread_id=128402 group by 1;
--   select count(*) from discovery_pending_artist;
