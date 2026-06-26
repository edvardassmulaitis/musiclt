// app/api/nav-preview/route.ts
//
// Vienas endpoint'as nav dropdown'ams — atveža:
//   - top atlikėjus (LT + world) Muzikos dropdown'ui
//   - latest albumus
//   - latest dainas (trending strip Muzikos dropdown'e)
//   - upcoming renginius
//   - latest naujienas
//
// Cache'inta agresyviai (s-maxage=300) — nav preview keičiasi retai.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { resolveDisplayWeek } from '@/lib/top-week'
import { getNewsFeed } from '@/lib/news-feed'
import { getGenreCounts, getTrendingArtists } from '@/lib/muzika-hub'
import { getEmergingArtists, getFeaturedArtists } from '@/lib/radaras'
import { formatPrice } from '@/lib/skelbimai'

export const dynamic = 'force-dynamic'

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/

/** YouTube thumbnail iš video_url (cover fallback). */
function ytThumb(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|\/vi\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

/** Mini chart eilutės topai dropdown'ui (LT TOP 30 + TOP 40 inline). */
async function getTopMini(sb: any, topType: string, limit: number) {
  // resolveDisplayWeek: jei einamoji savaitė tuščia — fallback į naujausią
  // finalizuotą su įrašais (kad nav rodytų tas pačias dainas kaip /topai).
  const { week } = await resolveDisplayWeek(sb, topType)
  if (!week) return []
  const { data: rows } = await sb
    .from('top_entries')
    .select('position, total_votes, title, artist_name, tracks:track_id ( slug, title, cover_url, video_url, artists:artist_id ( slug, name, cover_image_url ) )')
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)
  return (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return {
      position: r.position ?? i + 1,
      // Track title → denormalizuotas entry title (kai daina dar nesukurta kataloge)
      title: tr?.title || r.title || '—',
      artist: ar?.name || r.artist_name || '',
      artistSlug: ar?.slug ?? '', trackSlug: tr?.slug ?? null,
      // cover_url → YouTube thumbnail → atlikėjo nuotrauka (kad nebūtų placeholder)
      image: tr?.cover_url || ytThumb(tr?.video_url) || ar?.cover_image_url || null,
    }
  })
}

export async function GET() {
  const supabase = createAdminClient()

  try {
    const [tracksRes, eventsRes, newsRes, genresRes, ltCountRes, worldCountRes] = await Promise.all([
      // (genres pridėtas paskutinis — žr. apačioje)
      // 12 trending dainų
      supabase
        .from('tracks')
        .select('id, title, cover_url, release_year, artists!tracks_artist_id_fkey(id, name, slug, cover_image_url)')
        .not('cover_url', 'is', null)
        .order('id', { ascending: false })
        .limit(12),

      // Artimiausi renginiai (su atlikėjų šalimi — LT/užsienio skaidymui nav'e)
      supabase
        .from('events')
        .select('id, slug, title, start_date, venue_name, cover_image_url, event_artists(is_headliner, artists(country, cover_image_url))')
        .in('status', ['upcoming', 'ongoing'])
        .order('start_date', { ascending: true })
        .limit(24),

      // 4 naujausios naujienos
      supabase
        .from('news')
        .select('id, slug, title, image_small_url, image_title_url, published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(4),

      // 8 main žanrai su cover_image_url (admin'as nustato per /admin/genres)
      supabase
        .from('genres')
        .select('id, name, cover_image_url')
        .order('name'),

      // LT atlikėjų skaičius (DB total) — naudojamas Daugiau tile'ui
      supabase
        .from('artists')
        .select('id', { count: 'exact', head: true })
        .eq('country', 'Lietuva'),

      // Užsienio atlikėjų skaičius
      supabase
        .from('artists')
        .select('id', { count: 'exact', head: true })
        .or('country.is.null,country.neq.Lietuva'),
    ])

    // ── Topai dropdown'ui: LT TOP 30 + TOP 40 inline + featured išoriniai + votings ──
    const [top30Mini, top40Mini, featuredRes, votingsRes] = await Promise.all([
      getTopMini(supabase, 'lt_top30', 10),
      getTopMini(supabase, 'top40', 10),
      supabase
        .from('external_charts')
        .select('id, source, chart_key, title, subtitle, scope, country, accent, cover_image_url, period_label, size')
        .eq('is_current', true).eq('featured', true)
        .order('featured_order', { ascending: true })
        .limit(8),
      // Apdovanojimai / rinkimai — aktyvūs kanalai (MAMA, Grammy ir kt.).
      supabase
        .from('voting_channels')
        .select('id, slug, name, logo_url, cover_image_url, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(8),
    ])

    // Naujienų LT/užsienio skaidymas dropdown'ui — per news_feed RPC (scope).
    // Atskiros juostos „Lietuva" / „Pasaulis", kaip Muzika/Topai/Koncertai.
    const [ltNewsFeed, worldNewsFeed] = await Promise.all([
      getNewsFeed({ scope: 'lt', sort: 'newest', limit: 8 }),
      getNewsFeed({ scope: 'world', sort: 'newest', limit: 8 }),
    ])
    const mapFeedNews = (it: any) => ({
      id: it.uid, slug: it.slug, title: it.title, image: it.image, date: it.date,
    })

    // Žanrų atlikėjų skaičiai — Muzika dropdown'o stilių chip'ai rikiuojami pagal
    // realų atlikėjų kiekį (populiariausi pirma).
    const genreCountRows = await getGenreCounts()
    const genreCounts: Record<string, number> = {}
    for (const g of genreCountRows) genreCounts[g.name] = g.n

    // Atradimai dropdown'ui: dienos dainų nugalėtojai + naujausi narių įrašai.
    const [dailyWinnersRes, discoveryPostsRes, listingsRes] = await Promise.all([
      supabase
        .from('daily_song_winners')
        .select('date, tracks:track_id ( slug, title, cover_url, video_url, artists:artist_id ( name, slug, cover_image_url ) )')
        .order('date', { ascending: false })
        .limit(10),
      // Naujausi narių įrašai — ATSPINDI realų feed'ą (/api/home/community):
      //   !inner join + hide_from_homepage=not.is.true → paslėptų narių įrašai
      //   išmetami DB lygyje; topas rodomas tik patvirtintas. Be šių filtrų
      //   dropdown'as rodydavo paslėpto nario įrašus (Edvardo pastaba 2026-06-21).
      supabase
        .from('blog_posts')
        .select('id, slug, title, cover_image_url, post_type, published_at, blogs:blog_id!inner ( slug, profiles:user_id!inner ( full_name, username, avatar_url, hide_from_homepage ) )')
        .eq('status', 'published').eq('is_deleted', false)
        .not('published_at', 'is', null)
        .lte('published_at', new Date().toISOString())
        .not('blogs.profiles.hide_from_homepage', 'is', true)
        .or('post_type.neq.topas,topas_approved_at.not.is.null')
        .order('published_at', { ascending: false })
        .limit(80),
      // Naujausi aktyvūs skelbimai — Skelbimų dropdown'o juostai (realūs itemai)
      supabase
        .from('listings')
        .select('id, type, title, photos, price_cents, price_unit, is_free, city')
        .eq('status', 'active')
        .order('is_promoted', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    const dailySongs = (dailyWinnersRes.data || []).map((w: any) => {
      const t = Array.isArray(w.tracks) ? w.tracks[0] : w.tracks
      if (!t) return null
      const ar = Array.isArray(t.artists) ? t.artists[0] : t.artists
      return {
        slug: t.slug, title: t.title, artist: ar?.name || '',
        image: t.cover_url || ytThumb(t.video_url) || ar?.cover_image_url || null,
        date: w.date,
      }
    }).filter(Boolean).slice(0, 8)
    // Naujausi narių įrašai — švelnus dedup (max 2/autorių, kad būtų ir įvairovės,
    // ir pakankamai turinio). Vizualas = ĮRAŠO viršelis (cover_image_url arba
    // resolve iš prikabintų tracks/albums/artists, kaip homepage Pulsas) — NE
    // autoriaus avataras (avatar fallback pašalintas Edvardo prašymu 2026-06-04).
    const perAuthor = new Map<string, number>()
    const picked: any[] = []
    for (const r of (discoveryPostsRes.data || []) as any[]) {
      const blg = Array.isArray(r.blogs) ? r.blogs[0] : r.blogs
      const prof = blg ? (Array.isArray(blg.profiles) ? blg.profiles[0] : blg.profiles) : null
      const key = prof?.username || `p${r.id}`
      if ((perAuthor.get(key) || 0) >= 2) continue
      perAuthor.set(key, (perAuthor.get(key) || 0) + 1)
      picked.push({ r, blg, prof })
      if (picked.length >= 30) break
    }
    // Cover resolve tiems, kurie neturi cover_image_url (migruoti diary įrašai).
    const needCover = picked.filter(p => !p.r.cover_image_url).map(p => p.r.id)
    const coverMap = new Map<number, string>()
    if (needCover.length) {
      try {
        const [tj, aj, arj] = await Promise.all([
          supabase.from('blog_post_tracks').select('post_id, tracks:track_id ( video_url, cover_url, artist:artist_id ( cover_image_url ) )').in('post_id', needCover),
          supabase.from('blog_post_albums').select('post_id, albums:album_id ( cover_image_url )').in('post_id', needCover),
          supabase.from('blog_post_artists').select('post_id, artists:artist_id ( cover_image_url )').in('post_id', needCover),
        ])
        for (const row of (tj.data || []) as any[]) {
          if (coverMap.has(row.post_id)) continue
          const t = Array.isArray(row.tracks) ? row.tracks[0] : row.tracks
          if (!t) continue
          const yt = (t.video_url || '').match(YT_RE)?.[1]
          const art = Array.isArray(t.artist) ? t.artist[0] : t.artist
          const img = yt ? `https://img.youtube.com/vi/${yt}/mqdefault.jpg` : (t.cover_url || art?.cover_image_url || null)
          if (img) coverMap.set(row.post_id, img)
        }
        for (const row of (aj.data || []) as any[]) {
          if (coverMap.has(row.post_id)) continue
          const a = Array.isArray(row.albums) ? row.albums[0] : row.albums
          if (a?.cover_image_url) coverMap.set(row.post_id, a.cover_image_url)
        }
        for (const row of (arj.data || []) as any[]) {
          if (coverMap.has(row.post_id)) continue
          const a = Array.isArray(row.artists) ? row.artists[0] : row.artists
          if (a?.cover_image_url) coverMap.set(row.post_id, a.cover_image_url)
        }
      } catch {}
    }
    const mappedPosts = picked.map(({ r, blg, prof }) => ({
      id: r.id, slug: r.slug, title: r.title || '',
      blogSlug: blg?.slug || prof?.username || null,
      postType: r.post_type || 'article',
      image: r.cover_image_url || coverMap.get(r.id) || null,
      author: prof?.full_name || prof?.username || '',
    }))
    // Pirma rodom įrašus su REALIU vizualu (cover/resolved), recency tvarka;
    // teksto-only įrašus (gradientas) paliekam gale — kad juosta atrodytų pilna.
    const discoveryPosts = [
      ...mappedPosts.filter(p => p.image),
      ...mappedPosts.filter(p => !p.image),
    ].slice(0, 12)

    // Renginių LT/užsienio skaidymas: LT jei BENT VIENAS atlikėjas iš Lietuvos
    // arba apskritai nėra užsienio atlikėjo (be info → LT, kad juosta nebūtų tuščia).
    const evMap = (e: any) => ({ id: e.id, slug: e.slug, title: e.title, date: e.start_date, venue: e.venue_name, image: e.cover_image_url })
    const isLtEvent = (e: any) => {
      const arts = (e.event_artists || []).map((ea: any) => Array.isArray(ea.artists) ? ea.artists[0] : ea.artists).filter(Boolean)
      const hasLt = arts.some((a: any) => a?.country === 'Lietuva')
      const hasForeign = arts.some((a: any) => a?.country && a.country !== 'Lietuva')
      return hasLt || !hasForeign
    }

    // Radaras — „Dėmesio centre" (featured) PIRMI + nauji/kylantys. Degrade į [].
    let radarArtists: { id: number; slug: string; name: string; image: string | null }[] = []
    try {
      const [feat, emerging] = await Promise.all([getFeaturedArtists(), getEmergingArtists(8)])
      const seen = new Set<number>()
      radarArtists = [...feat, ...emerging]
        .filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true })
        .slice(0, 10)
        .map((a) => ({ id: a.id, slug: a.slug, name: a.name, image: a.cover_image_url }))

      // Radaro atlikėjams be foto → top dainos vizualas (cover arba YouTube thumbnail).
      const noImgIds = radarArtists.filter((a) => !a.image).map((a) => a.id)
      if (noImgIds.length) {
        const { data: trk } = await supabase
          .from('tracks')
          .select('artist_id, cover_url, video_url')
          .in('artist_id', noImgIds)
          .order('id', { ascending: false })
        const imgByArtist = new Map<number, string>()
        for (const t of (trk || []) as any[]) {
          if (imgByArtist.has(t.artist_id)) continue
          const img = t.cover_url || ytThumb(t.video_url)
          if (img) imgByArtist.set(t.artist_id, img)
        }
        radarArtists = radarArtists.map((a) => a.image ? a : { ...a, image: imgByArtist.get(a.id) || null })
      }
    } catch { radarArtists = [] }

    // ── Konkretūs chartai Topai Lietuvoje/Pasaulyje vitrinom (dainos + albumai) ──
    // Lietuvoje: dainos = consensus/lt, albumai = agata/albums.
    // Pasaulyje:  dainos = consensus/world, albumai = consensus/albums.
    const chartItems = async (source: string, chartKey: string, kind: 'song' | 'album', limit: number) => {
      const { data: ch } = await supabase
        .from('external_charts')
        .select('id')
        .eq('source', source).eq('chart_key', chartKey).eq('is_current', true)
        .limit(1).maybeSingle()
      if (!ch) return []
      const { data: ents } = await supabase
        .from('external_chart_entries')
        .select('position, title, artist_name, cover_url, track_id, album_id, tracks:track_id ( slug, video_url, artists:artist_id ( slug ) ), albums:album_id ( slug, artists:artist_id ( slug ) )')
        .eq('chart_id', ch.id)
        .order('position', { ascending: true })
        .limit(limit)
      return ((ents || []) as any[]).map((e: any) => {
        const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
        const al = Array.isArray(e.albums) ? e.albums[0] : e.albums
        let href = '/topai'
        if (kind === 'song' && e.track_id && tr) {
          const ar = Array.isArray(tr.artists) ? tr.artists[0] : tr.artists
          href = `/dainos/${ar?.slug ? `${ar.slug}-` : ''}${tr.slug ? `${tr.slug}-` : ''}${e.track_id}`
        } else if (kind === 'album' && e.album_id && al) {
          const ar = Array.isArray(al.artists) ? al.artists[0] : al.artists
          href = `/albumai/${ar?.slug ? `${ar.slug}-` : ''}${al.slug ? `${al.slug}-` : ''}${e.album_id}`
        }
        return { href, title: e.title || '', artist: e.artist_name || '', image: e.cover_url || ytThumb(tr?.video_url) || null }
      })
    }
    const [chartLtSongs, chartLtAlbums, chartWorldSongs, chartWorldAlbums] = await Promise.all([
      chartItems('consensus', 'lt', 'song', 10),
      chartItems('agata', 'albums', 'album', 10),
      chartItems('consensus', 'world', 'song', 10),
      chartItems('consensus', 'albums', 'album', 10),
    ])

    // ── Narių topai (blog_posts post_type=topas) — Topai „Narių topai" skilčiai ──
    const { data: memberTopRows } = await supabase
      .from('blog_posts')
      .select('id, slug, title, cover_image_url, list_items, blogs:blog_id!inner ( slug, profiles:user_id!inner ( username, full_name, hide_from_homepage ) )')
      .eq('status', 'published')
      .eq('post_type', 'topas')
      .not('topas_approved_at', 'is', null)
      .not('blogs.profiles.hide_from_homepage', 'is', true)
      .order('like_count', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false })
      .limit(10)
    const memberTops = ((memberTopRows || []) as any[]).map((r: any) => {
      const blg = Array.isArray(r.blogs) ? r.blogs[0] : r.blogs
      const prof = blg ? (Array.isArray(blg.profiles) ? blg.profiles[0] : blg.profiles) : null
      const items = Array.isArray(r.list_items) ? r.list_items : []
      const cover = r.cover_image_url || (items.find((it: any) => it?.image_url)?.image_url) || null
      const blogSlug = blg?.slug || prof?.username || null
      return {
        id: r.id,
        title: r.title || 'Nario topas',
        image: cover,
        author: prof?.username || prof?.full_name || 'narys',
        href: blogSlug ? `/blogas/${blogSlug}/${r.slug || r.id}` : '/topai/nariu',
      }
    })

    // ── Trending atlikėjai (charts → naujausi releases → score_trending) ──
    // Pakeičia seną all-time `score` rikiavimą — nav rodo DABAR populiarius.
    const [trLt, trWorld] = await Promise.all([
      getTrendingArtists('lt', 12),
      getTrendingArtists('world', 12),
    ])
    // Trending albumai = trending atlikėjų naujausi albumai (po 1 atlikėjui),
    // ta pačia trending tvarka. Albumai DB neturi savo trending metrikos.
    const trendingAlbums = async (artistIds: number[], limit: number) => {
      if (!artistIds.length) return []
      const { data } = await supabase
        .from('albums')
        .select('id, slug, title, cover_image_url, year, artist_id, artists!albums_artist_id_fkey(name, slug)')
        .in('artist_id', artistIds)
        .not('cover_image_url', 'is', null)
        .eq('is_upcoming', false)
        .order('year', { ascending: false, nullsFirst: false })
      const byArtist = new Map<number, any>()
      for (const r of (data || []) as any[]) if (!byArtist.has(r.artist_id)) byArtist.set(r.artist_id, r)
      const out: any[] = []
      for (const id of artistIds) { const a = byArtist.get(id); if (a) out.push(a); if (out.length >= limit) break }
      return out
    }
    const [albLtRows, albWorldRows] = await Promise.all([
      trendingAlbums(trLt.map(a => a.id), 10),
      trendingAlbums(trWorld.map(a => a.id), 10),
    ])
    const mapNavArtist = (a: any) => ({ id: a.id, slug: a.slug, name: a.name, image: a.cover_image_url })
    const mapNavAlbum  = (a: any) => ({ id: a.id, slug: a.slug, title: a.title, image: a.cover_image_url, year: a.year, artist: a.artists?.name || '', artistSlug: a.artists?.slug || '' })

    // ── Agreguotos trending dainos iš VISŲ chartų (ne tik music.lt voting) ──
    // Sumuojam pozicijų svorius per visus is_current išorinius chartus (Spotify,
    // Apple ir kt., LT + pasaulis); is_new / kylančioms +bonusas → „labiausiai
    // trending". Skaidom pagal chart scope (LT vs pasaulis).
    const { data: ecRows } = await supabase
      .from('external_chart_entries')
      .select('track_id, position, is_new, prev_position, tracks:track_id ( id, slug, title, cover_url, video_url, artists:artist_id ( name, slug ) ), external_charts!inner ( is_current, scope, chart_key )')
      .eq('external_charts.is_current', true)
      .eq('resolve_state', 'matched')
      .neq('external_charts.chart_key', 'albums')
      .not('track_id', 'is', null)
      .limit(4000)
    const aggLt = new Map<number, { score: number; t: any }>()
    const aggWorld = new Map<number, { score: number; t: any }>()
    for (const e of (ecRows || []) as any[]) {
      const tr = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
      if (!tr) continue
      const ec = Array.isArray(e.external_charts) ? e.external_charts[0] : e.external_charts
      const isLt = String(ec?.scope || '').toLowerCase() === 'lt'
      const pos = e.position || 50
      let w = Math.max(1, 101 - pos)
      if (e.is_new) w += 20
      if (e.prev_position && e.prev_position > pos) w += 10
      const m = isLt ? aggLt : aggWorld
      const cur = m.get(e.track_id) || { score: 0, t: tr }
      cur.score += w
      m.set(e.track_id, cur)
    }
    const rankSongs = (m: Map<number, { score: number; t: any }>, limit: number) =>
      [...m.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit).map(([id, v]) => {
        const ar = Array.isArray(v.t.artists) ? v.t.artists[0] : v.t.artists
        return { id, slug: v.t.slug, title: v.t.title, image: v.t.cover_url || ytThumb(v.t.video_url) || null, artist: ar?.name || '', artistSlug: ar?.slug || '' }
      })
    const songsLt = rankSongs(aggLt, 12)
    const songsWorld = rankSongs(aggWorld, 12)

    const payload = {
      radar: radarArtists,
      artistsLt:    trLt.map(mapNavArtist),
      artistsWorld: trWorld.map(mapNavArtist),
      albumsLt:     albLtRows.map(mapNavAlbum),
      albumsWorld:  albWorldRows.map(mapNavAlbum),
      albums:       [...albLtRows, ...albWorldRows].slice(0, 12).map(mapNavAlbum),
      songsLt,
      songsWorld,
      memberTops,
      chartLtSongs,
      chartLtAlbums,
      chartWorldSongs,
      chartWorldAlbums,
      tracks: (tracksRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        image: t.cover_url || t.artists?.cover_image_url || null,
        year: t.release_year,
        artist: t.artists?.name || '',
        artistSlug: t.artists?.slug || '',
      })),
      events: (eventsRes.data || []).slice(0, 8).map(evMap),
      eventsLt: (eventsRes.data || []).filter(isLtEvent).slice(0, 10).map(evMap),
      eventsWorld: (eventsRes.data || []).filter((e: any) => !isLtEvent(e)).slice(0, 10).map(evMap),
      news: (newsRes.data || []).map((n: any) => ({
        id: n.id,
        slug: n.slug,
        title: n.title,
        image: n.image_small_url || n.image_title_url || null,
        date: n.published_at,
      })),
      newsLt: ltNewsFeed.items.map(mapFeedNews),
      newsWorld: worldNewsFeed.items.map(mapFeedNews),
      dailySongs,
      discoveryPosts,
      listings: (listingsRes.data || []).map((l: any) => ({
        id: l.id,
        type: l.type,
        title: l.title,
        image: Array.isArray(l.photos) && l.photos.length ? l.photos[0] : null,
        price: formatPrice(l.price_cents, l.price_unit, l.is_free),
        city: l.city || null,
      })),
      genreCounts,
      // Žanrų name → cover_image_url map (frontend lookup'ina pagal name iš GENRE_COLORS)
      genres: (genresRes.data || []).reduce((acc: Record<string, string | null>, g: any) => {
        acc[g.name] = g.cover_image_url || null
        return acc
      }, {} as Record<string, string | null>),
      // Total atlikėjų DB skaičiai — Daugiau tile'ui (atsinaujinia su SWR cache)
      counts: {
        artistsLt:    ltCountRes.count || 0,
        artistsWorld: worldCountRes.count || 0,
      },
      // Topai dropdown'ui: pagrindiniai voting topai + featured išoriniai + votings
      topChart: { top30: top30Mini, top40: top40Mini },
      featuredCharts: (featuredRes.data || []).map((c: any) => ({
        id: c.id, source: c.source, chartKey: c.chart_key, title: c.title,
        subtitle: c.subtitle, scope: c.scope, country: c.country ?? null, accent: c.accent || '#6366f1',
        image: c.cover_image_url || null, period: c.period_label, size: c.size,
      })),
      votings: (votingsRes.data || []).map((c: any) => ({
        id: c.id, slug: c.slug, name: c.name, image: c.logo_url || c.cover_image_url || null,
      })),
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control':            'public, s-maxage=300, stale-while-revalidate=900',
        'CDN-Cache-Control':        'public, s-maxage=300, stale-while-revalidate=900',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
