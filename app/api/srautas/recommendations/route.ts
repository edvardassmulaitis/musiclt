// app/api/srautas/recommendations/route.ts
//
// GET /api/srautas/recommendations?limit=45
//
// „Tau" — atradimų feed'as. Skirtingai nei /api/srautas/feed (Sekami = turinys
// iš JAU pamėgtų atlikėjų), čia siūlome tai, ko narys DAR neseka:
//
//   • rekomenduojami atlikėjai (recommend_taste RPC: collaborative co-like +
//     žanrų/substilių artumas + rising recent_score), su reason label;
//   • jų nauji leidiniai (tracks/albums);
//   • artėjantys koncertai, kuriuose groja pamėgti arba rekomenduojami atlikėjai;
//   • rekomenduojamos diskusijos (susietos su tais atlikėjais).
//
// Visi šaltiniai supinami į VIENĄ feed'ą (ne dashboard blokai). Jei narys
// neprisijungęs arba dar nieko nepamėgo → discovery fallback (kylantys vardai +
// nauji leidiniai), personalized=false.
//
// Resilient: kiekvienas šaltinis savo try/catch.

import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { getVertaKelionesData } from '@/lib/verta-keliones-db'
import { DEST_BY_KEY, flagEmoji } from '@/lib/verta-keliones-seed'

export const dynamic = 'force-dynamic'

function tripSubtitle(destKey: string, fallbackVenue?: string | null): string | null {
  const d = DEST_BY_KEY[destKey]
  if (!d) return fallbackVenue || null
  const flag = d.countryCode ? flagEmoji(d.countryCode) : ''
  return `${flag ? flag + ' ' : ''}${d.country} · ${d.city}`
}

function tripInfo(destKey: string): string | null {
  const d = DEST_BY_KEY[destKey]
  if (!d) return null
  if (d.reach === 'car') {
    const parts = ['🚗 Pasiekiama mašina']
    if (d.driveHours) parts.push(`~${d.driveHours} val. kelio${d.driveFrom ? ` nuo ${d.driveFrom}` : ''}`)
    return parts.join(' · ')
  }
  const parts = ['✈️ Skrydis']
  if (d.carrier) parts.push(d.carrier)
  if (d.priceFrom) parts.push(`nuo ${d.priceFrom} €`)
  return parts.join(' · ')
}

const YT_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
const ytThumb = (url?: string | null) => {
  const m = url?.match?.(YT_RE)?.[1]
  return m ? `https://img.youtube.com/vi/${m}/mqdefault.jpg` : null
}
const albumDate = (y?: number | null, m?: number | null, d?: number | null) =>
  y ? `${y}-${String(m || 1).padStart(2, '0')}-${String(d || 1).padStart(2, '0')}T00:00:00.000Z` : null
const one = (v: any) => (Array.isArray(v) ? v[0] : v)

// Išvalo legacy diskusijų pavadinimų šiukšles iš seno forumo importo:
// „R E M |232112" → „R E M"; „232112| Title" → „Title"; likę pavieniai „|".
function cleanTitle(t?: string | null): string {
  return (t || '')
    .replace(/\s*\|\s*\d{3,}\s*$/g, '')
    .replace(/^\s*\d{3,}\s*\|\s*/g, '')
    .replace(/\s*\|\s*\d{3,}(?=\s|\|)/g, '')
    .replace(/\s*\|\s*$/,'')
    .replace(/\s{2,}/g, ' ').trim()
}

type RecItem = {
  key: string
  kind: 'artist' | 'track' | 'album' | 'event' | 'topic' | 'chart'
  title: string
  subtitle: string | null
  image: string | null
  href: string
  date: string | null
  badge: string
  reason?: string
  because?: string | null
  becauseArtists?: { name: string; image: string | null }[] | null
  avatar?: string | null
  badgeColor?: string | null
  artist?: { id: number; name: string; slug: string | null } | null
  meta?: Record<string, any>
}

const REASON_BADGE: Record<string, string> = {
  fans: 'Patinka panašiems',
  rising: 'Kylantis vardas',
  similar: 'Panašus stilius',
  popular: 'Vertas dėmesio',
}

// Supina kelias tipų eiles į vieną feed'ą: atlikėjai dominuoja, o leidiniai /
// koncertai / temos juos punktuoja — kad būtų gyvas, ne monotoniškas srautas.
function weave(queues: Record<string, RecItem[]>, limit: number): RecItem[] {
  const template = ['artist', 'artist', 'release', 'artist', 'chart', 'artist', 'trip', 'artist', 'topic', 'artist', 'release', 'artist', 'event']
  const out: RecItem[] = []
  let ti = 0
  const order = ['artist', 'release', 'chart', 'trip', 'event', 'topic']
  while (out.length < limit) {
    const want = template[ti % template.length]
    ti++
    let pick = queues[want]?.shift()
    if (!pick) {
      // norimo tipo nebėra — imam iš bet kurios netuščios eilės (artist pirma)
      const fb = order.find(k => queues[k]?.length)
      if (!fb) break
      pick = queues[fb].shift()
    }
    if (pick) out.push(pick)
  }
  return out
}

// Diversity reorder: dvi gretimos kortelės niekada ne iš to paties atlikėjo —
// kad rekomendacijų nedominuotų viena pamėgta grupė (pvz. visi „panašūs į RHCP").
function spreadByArtist(items: RecItem[]): RecItem[] {
  const out: RecItem[] = []
  const pool = [...items]
  let lastAid: number | null | undefined = undefined
  while (pool.length) {
    let idx = pool.findIndex(it => !it.artist?.id || it.artist.id !== lastAid)
    if (idx === -1) idx = 0
    const [pick] = pool.splice(idx, 1)
    out.push(pick)
    lastAid = pick.artist?.id
  }
  return out
}

type Rec = { artist_id: number; name: string; slug: string | null; cover_image_url: string | null; country: string | null; recent_score: number | null; reason: string }

// Visa rekomendacijų logika — sukeliama į cache'inamą fn (žr. žemiau). Enrichment
// užklausos (leidiniai / koncertai / temos) leidžiamos LYGIAGREČIAI (Promise.all),
// ne nuosekliai — tai didžiausias greičio laimėjimas.
async function buildRecs(uid: string, likedIds: number[], limit: number) {
  const sb = createAdminClient()

  // ── 1. Rekomenduojami atlikėjai (RPC) ──────────────────────────────────────
  let recs: Rec[] = []
  if (uid && likedIds.length > 0) {
    try {
      const { data } = await sb.rpc('recommend_taste', { p_user: uid, p_limit: 40 })
      recs = (data || []) as Rec[]
    } catch { /* RPC nėra / klaida → fallback žemiau */ }
  }

  // ── Discovery fallback: anon, 0 like'ų arba RPC tuščia ─────────────────────
  const personalized = recs.length > 0
  if (!personalized) {
    try {
      const { data } = await sb
        .from('artists')
        .select('id, name, slug, cover_image_url, country, recent_score')
        .not('cover_image_url', 'is', null)
        .order('recent_score', { ascending: false, nullsFirst: false })
        .limit(40)
      recs = ((data || []) as any[])
        .filter(a => !likedIds.includes(Number(a.id)))
        .map(a => ({ ...a, artist_id: Number(a.id), reason: (a.recent_score || 0) > 100 ? 'rising' : 'popular' }))
    } catch { /* ignore */ }
  }

  const recIds = recs.map(r => r.artist_id)
  const recById = new Map(recs.map(r => [r.artist_id, r]))
  const matchIds = Array.from(new Set([...likedIds, ...recIds]))
  const topRecIds = recIds.slice(0, 16)

  const queues: Record<string, RecItem[]> = { artist: [], release: [], chart: [], event: [], topic: [], trip: [] }

  // ── 2a. Atlikėjų kortelės (sync) ───────────────────────────────────────────
  for (const r of recs) {
    queues.artist.push({
      key: `artist-${r.artist_id}`, kind: 'artist', title: r.name,
      subtitle: r.country || null, image: r.cover_image_url,
      href: `/atlikejai/${r.slug || r.artist_id}`, date: null,
      badge: REASON_BADGE[r.reason] || REASON_BADGE.similar, reason: r.reason,
      artist: { id: r.artist_id, name: r.name, slug: r.slug },
    })
  }

  // ── 2b–2d. Leidiniai / koncertai / temos — LYGIAGREČIAI ────────────────────
  const releasesTask = async () => {
    if (!topRecIds.length) return
    const [tracksRes, albumsRes] = await Promise.all([
      sb.from('tracks')
        .select('id, title, slug, cover_url, video_url, video_uploaded_at, release_date, release_year, release_month, release_day, artist_id, artists!tracks_artist_id_fkey(name, slug, cover_image_url)')
        .in('artist_id', topRecIds).not('video_uploaded_at', 'is', null)
        .order('video_uploaded_at', { ascending: false }).limit(12),
      sb.from('albums')
        .select('id, title, slug, cover_image_url, year, month, day, artist_id, artists!albums_artist_id_fkey(name, slug, cover_image_url)')
        .in('artist_id', topRecIds).not('year', 'is', null)
        .order('year', { ascending: false }).order('month', { ascending: false, nullsFirst: false }).limit(8),
    ])
    const curYear = new Date().getFullYear()
    for (const t of (tracksRes.data || []) as any[]) {
      const a = one(t.artists)
      // Seno katalogo filtras (žr. feed/route.ts): 1987 m. daina ≠ naujiena.
      const ry = t.release_year || (t.release_date ? new Date(t.release_date).getFullYear() : null)
      if (ry && ry < curYear - 1) continue
      const td = t.video_uploaded_at || t.release_date || albumDate(t.release_year, t.release_month, t.release_day)
      if (td && Date.parse(td) > Date.now()) continue // dar neišleista
      queues.release.push({
        key: `track-${t.id}`, kind: 'track', title: t.title || '', subtitle: a?.name || null,
        image: t.cover_url || ytThumb(t.video_url) || a?.cover_image_url || null,
        href: `/dainos/${a?.slug ? a.slug + '-' : ''}${t.slug || 'daina'}-${t.id}`,
        date: t.video_uploaded_at || t.release_date || albumDate(t.release_year, t.release_month, t.release_day),
        badge: 'Nauja daina', avatar: a?.cover_image_url || null,
        artist: a ? { id: t.artist_id, name: a.name, slug: a.slug } : null,
        meta: { ytId: t.video_url?.match?.(YT_RE)?.[1] || null },
      })
    }
    const albumIds: number[] = []
    for (const al of (albumsRes.data || []) as any[]) {
      const a = one(al.artists)
      const ad = albumDate(al.year, al.month, al.day)
      if (ad && Date.parse(ad) > Date.now()) continue // dar neišleistas (Muse – Wow Signal)
      albumIds.push(Number(al.id))
      queues.release.push({
        key: `album-${al.id}`, kind: 'album', title: al.title || '', subtitle: a?.name || null,
        image: al.cover_image_url || a?.cover_image_url || null,
        href: a?.slug ? `/albumai/${a.slug}-${al.slug}-${al.id}` : `/albumai/${al.slug || ''}-${al.id}`,
        date: albumDate(al.year, al.month, al.day), badge: 'Naujas albumas', avatar: a?.cover_image_url || null,
        artist: a ? { id: al.artist_id, name: a.name, slug: a.slug } : null,
      })
    }
    // Albumams — ≤2 populiariausios dainos su klipais (inline ▶ grotuvai).
    if (albumIds.length) {
      try {
        const { data: at } = await sb.from('album_tracks')
          .select('album_id, tracks:track_id(title, video_url, video_views)').in('album_id', albumIds)
        const byAlbum = new Map<number, { yt: string; title: string; views: number }[]>()
        for (const r of (at || []) as any[]) {
          const t = one(r.tracks); if (!t) continue
          const yt = t.video_url?.match?.(YT_RE)?.[1]; if (!yt) continue
          const aid = Number(r.album_id)
          const arr = byAlbum.get(aid) || []; arr.push({ yt, title: t.title || '', views: Number(t.video_views) || 0 }); byAlbum.set(aid, arr)
        }
        for (const item of queues.release) {
          if (item.kind !== 'album') continue
          const arr = (byAlbum.get(Number(item.key.split('-').pop())) || []).sort((a, b) => b.views - a.views)
          const seenYt = new Set<string>(); const top: { ytId: string; title: string }[] = []
          for (const x of arr) { if (seenYt.has(x.yt)) continue; seenYt.add(x.yt); top.push({ ytId: x.yt, title: x.title }); if (top.length >= 2) break }
          if (top.length) item.meta = { ...(item.meta || {}), albumTracks: top }
        }
      } catch { /* ignore */ }
    }
    // Per-artist cap: ne daugiau 1 leidinio kiekvienam rekomenduojamam atlikėjui,
    // kad srauto nedominuotų vienas atlikėjas su daug naujų dainų.
    const perArtist = new Map<number, number>()
    const capped = queues.release
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''))
      .filter(it => {
        const aid = it.artist?.id
        if (!aid) return true
        const n = perArtist.get(aid) || 0
        if (n >= 1) return false
        perArtist.set(aid, n + 1)
        return true
      })
    queues.release = capped
  }


  // Tau = ATRADIMAI: koncertai TIK rekomenduojamų (ne pamėgtų) atlikėjų —
  // pamėgtų atlikėjų koncertai rodomi „Mėgstami" sraute (atskyrimas).
  const eventsTask = async () => {
    if (!recIds.length) return
    const { data: ea } = await sb.from('event_artists').select('event_id, artist_id').in('artist_id', recIds).limit(400)
    const eventArtist = new Map<number, number>() // event_id → rekomenduojamas artist_id (pirmas)
    for (const r of (ea || []) as any[]) { const e = Number(r.event_id); if (!eventArtist.has(e)) eventArtist.set(e, Number(r.artist_id)) }
    const eventIds = Array.from(eventArtist.keys())
    if (!eventIds.length) return
    const { data } = await sb.from('events')
      .select('id, title, slug, cover_image_url, start_date, city, venue_name')
      .in('id', eventIds).gte('start_date', new Date().toISOString())
      .order('start_date', { ascending: true }).limit(6)
    for (const ev of (data || []) as any[]) {
      const aid = eventArtist.get(Number(ev.id)) || 0
      const a = aid ? recById.get(aid) : null
      queues.event.push({
        key: `event-${ev.id}`, kind: 'event', title: ev.title || '',
        subtitle: [ev.city, ev.venue_name].filter(Boolean).join(' · ') || null,
        image: ev.cover_image_url || a?.cover_image_url || null, href: `/renginiai/${ev.slug}`, date: ev.start_date, badge: 'Koncertas',
        artist: a ? { id: aid, name: a.name, slug: a.slug } : null,
      })
    }
  }

  // ── Verta kelionės — dideli koncertai užsienyje (discovery, top pagal populiarumą) ──
  const vertaTask = async () => {
    try {
      // Pamėgtų atlikėjų koncertus PRALEIDŽIAM — jie rodomi „Mėgstami" sraute.
      const likedSlugs = new Set<string>(); const likedNames = new Set<string>()
      if (likedIds.length) {
        const { data: la } = await sb.from('artists').select('slug, name').in('id', likedIds.slice(0, 500))
        for (const a of (la || []) as any[]) { if (a.slug) likedSlugs.add(a.slug); if (a.name) likedNames.add(String(a.name).trim().toLowerCase()) }
      }
      const { concerts } = await getVertaKelionesData()
      const now = Date.now()
      const fut = (concerts as any[])
        .filter(c => { const t = Date.parse(c.date); return Number.isFinite(t) && t >= now })
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      const seenArtist = new Set<string>()
      for (const c of fut) {
        const nm = (c.artist || '').trim().toLowerCase()
        if ((c.artistSlug && likedSlugs.has(c.artistSlug)) || (nm && likedNames.has(nm))) continue // pamėgtas → Mėgstami
        const aslug = c.artistSlug || c.artist
        if (seenArtist.has(aslug)) continue
        seenArtist.add(aslug)
        queues.trip.push({
          key: `trip-${c.id}`, kind: 'event',
          title: c.isFestival ? (c.festivalName || c.artist) : c.artist,
          subtitle: tripSubtitle(c.destKey, c.venue), image: c.image || null,
          href: `/verta-keliones#vk-${(c as any).slug || c.id}`, date: c.date, badge: 'Koncertas, vertas kelionės',
          meta: { tripInfo: tripInfo(c.destKey), excerpt: c.why || null },
        })
        if (queues.trip.length >= 6) break
      }
    } catch { /* ignore */ }
  }

  // Atlikėjų kortelėms — žanrai/stiliai (vietoj šalies).
  const artistGenres = new Map<number, string[]>()
  const genresTask = async () => {
    if (!recIds.length) return
    try {
      const { data } = await sb.from('artist_genres').select('artist_id, genres:genre_id(name)').in('artist_id', recIds)
      for (const r of (data || []) as any[]) {
        const nm = one(r.genres)?.name
        if (!nm) continue
        const arr = artistGenres.get(Number(r.artist_id)) || []
        if (arr.length < 3 && !arr.includes(nm)) { arr.push(nm); artistGenres.set(Number(r.artist_id), arr) }
      }
    } catch { /* ignore */ }
  }

  // Rekomenduojamų atlikėjų populiariausia daina — kad kortelėje būtų inline ▶ grotuvas.
  const topTrackByArtist = new Map<number, { ytId: string; title: string }>()
  const topTrackTask = async () => {
    if (!topRecIds.length) return
    try {
      const { data } = await sb.from('tracks')
        .select('artist_id, title, video_url, video_views')
        .in('artist_id', topRecIds).not('video_url', 'is', null)
        .order('video_views', { ascending: false, nullsFirst: false }).limit(160)
      for (const t of (data || []) as any[]) {
        const aid = Number(t.artist_id)
        if (topTrackByArtist.has(aid)) continue
        const yt = t.video_url?.match?.(YT_RE)?.[1]
        if (!yt) continue
        topTrackByArtist.set(aid, { ytId: yt, title: t.title || '' })
      }
    } catch { /* ignore */ }
  }

  // „Nes mėgsti X" — TIKRAS co-like: pamėgti atlikėjai, kuriuos dažniausiai mėgsta
  // tie patys žmonės, kaip ir rekomenduojamą atlikėją (bendri „like'ai" likes lentelėj).
  // Jei co-like nieko negrąžina (mažai duomenų) — fallback į žanrų persidengimą.
  // Skaičiuojama RETAI (recs cache 5 min), todėl kaina priimtina.
  const becauseMap = new Map<number, string>()
  const becauseArtistsMap = new Map<number, { name: string; image: string | null }[]>()
  const becauseTask = async () => {
    if (!personalized || !recIds.length || !likedIds.length) return
    const likedSample = likedIds.slice(0, 300)
    const [ln, lg, rg, recLk, likedLk] = await Promise.all([
      sb.from('artists').select('id, name, cover_image_url').in('id', likedSample),
      sb.from('artist_genres').select('genre_id, artist_id').in('artist_id', likedSample),
      sb.from('artist_genres').select('genre_id, artist_id').in('artist_id', recIds),
      sb.from('likes').select('user_id, entity_id').eq('entity_type', 'artist').in('entity_id', recIds).limit(6000),
      sb.from('likes').select('user_id, entity_id').eq('entity_type', 'artist').in('entity_id', likedSample).limit(8000),
    ])
    const nameById = new Map<number, string>(((ln.data || []) as any[]).map(r => [Number(r.id), r.name as string]))
    const imgById = new Map<number, string | null>(((ln.data || []) as any[]).map(r => [Number(r.id), r.cover_image_url as string | null]))
    const nameToId = new Map<string, number>(((ln.data || []) as any[]).map(r => [r.name as string, Number(r.id)]))

    // Co-like: kas mėgsta atlikėją → user_id aibės.
    const recLikers = new Map<number, Set<string>>()
    for (const r of (recLk.data || []) as any[]) {
      const e = Number(r.entity_id); let s = recLikers.get(e); if (!s) { s = new Set(); recLikers.set(e, s) }
      if (s.size < 2500) s.add(String(r.user_id))
    }
    const likedLikers = new Map<number, Set<string>>()
    for (const r of (likedLk.data || []) as any[]) {
      const e = Number(r.entity_id); let s = likedLikers.get(e); if (!s) { s = new Set(); likedLikers.set(e, s) }
      if (s.size < 2500) s.add(String(r.user_id))
    }

    // Žanrų fallback (kaip anksčiau).
    const genreToLiked = new Map<number, string[]>()
    for (const r of (lg.data || []) as any[]) {
      const gid = Number(r.genre_id); const nm = nameById.get(Number(r.artist_id)); if (!nm) continue
      const arr = genreToLiked.get(gid) || []
      if (arr.length < 6 && !arr.includes(nm)) { arr.push(nm); genreToLiked.set(gid, arr) }
    }
    const recGenres = new Map<number, number[]>()
    for (const r of (rg.data || []) as any[]) {
      const aid = Number(r.artist_id); const arr = recGenres.get(aid) || []; arr.push(Number(r.genre_id)); recGenres.set(aid, arr)
    }

    for (const rid of recIds) {
      let names: string[] = []
      // 1) co-like kaimynai
      const rset = recLikers.get(rid)
      if (rset && rset.size >= 3) {
        const scored: [number, number][] = []
        for (const L of likedSample) {
          const lset = likedLikers.get(L); if (!lset) continue
          const [small, big] = rset.size < lset.size ? [rset, lset] : [lset, rset]
          let inter = 0; for (const u of small) if (big.has(u)) inter++
          if (inter > 0) scored.push([L, inter])
        }
        scored.sort((a, b) => b[1] - a[1])
        names = scored.slice(0, 3).map(([L]) => nameById.get(L)).filter(Boolean) as string[]
      }
      // 2) fallback — žanrų persidengimas
      if (!names.length) {
        for (const g of recGenres.get(rid) || []) {
          for (const nm of genreToLiked.get(g) || []) { if (!names.includes(nm)) names.push(nm); if (names.length >= 3) break }
          if (names.length >= 3) break
        }
      }
      if (names.length) {
        becauseMap.set(rid, names.join(' · '))
        becauseArtistsMap.set(rid, names.slice(0, 3).map(n => ({ name: n, image: imgById.get(nameToId.get(n) ?? -1) ?? null })))
      }
    }
  }

  const topicsTask = async () => {
    if (!matchIds.length) return
    const { data } = await sb.from('discussions')
      .select('id, title, slug, artist_id, comment_count, like_count, last_comment_at, created_at')
      .in('artist_id', matchIds).eq('is_deleted', false)
      .or('legacy_kind.is.null,legacy_kind.eq.discussion')
      .order('last_comment_at', { ascending: false, nullsFirst: false }).limit(6)
    const rows = (data || []) as any[]
    // Atlikėjų nuotraukos (recById turi TIK rekomenduojamus; pamėgtiems reikia atskiros užklausos).
    const artCover = new Map<number, { name: string; cover: string | null }>()
    const artIds = Array.from(new Set(rows.map(d => Number(d.artist_id)).filter(Boolean)))
    if (artIds.length) {
      try {
        const { data: arts } = await sb.from('artists').select('id, name, cover_image_url').in('id', artIds)
        for (const a of (arts || []) as any[]) artCover.set(Number(a.id), { name: a.name, cover: a.cover_image_url || null })
      } catch { /* ignore */ }
    }
    const lastComment = new Map<number, { body: string; by: string | null; avatar: string | null }>()
    const ids = rows.map(d => d.id)
    if (ids.length) {
      try {
        const { data: cmts } = await sb.from('comments')
          .select('discussion_id, body, created_at, author_id')
          .in('discussion_id', ids).eq('is_deleted', false).not('body', 'is', null)
          .order('created_at', { ascending: false }).limit(80)
        const picked = new Map<number, { body: string; author_id: string | null }>()
        for (const c of (cmts || []) as any[]) {
          if (picked.has(c.discussion_id)) continue
          const t = (c.body || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
          if (!t) continue
          picked.set(c.discussion_id, { body: t.length > 400 ? t.slice(0, 400).trimEnd() + '…' : t, author_id: c.author_id ? String(c.author_id) : null })
        }
        const authorIds = Array.from(new Set(Array.from(picked.values()).map(p => p.author_id).filter(Boolean))) as string[]
        const profById = new Map<string, { name: string | null; avatar: string | null }>()
        if (authorIds.length) {
          const { data: profs } = await sb.from('profiles').select('id, full_name, username, avatar_url').in('id', authorIds)
          for (const p of (profs || []) as any[]) profById.set(String(p.id), { name: p.full_name || p.username || null, avatar: p.avatar_url || null })
        }
        for (const [did, v] of picked) {
          const pr = v.author_id ? profById.get(v.author_id) : null
          lastComment.set(did, { body: v.body, by: pr?.name || null, avatar: pr?.avatar || null })
        }
      } catch { /* ignore */ }
    }
    for (const d of rows) {
      const aid = d.artist_id ? Number(d.artist_id) : 0
      const rec = aid ? recById.get(aid) : null
      const ac = aid ? artCover.get(aid) : null
      const name = rec?.name || ac?.name || null
      const cover = rec?.cover_image_url || ac?.cover || null
      const cmt = lastComment.get(d.id)
      queues.topic.push({
        key: `topic-${d.id}`, kind: 'topic', title: cleanTitle(d.title),
        subtitle: name || (d.comment_count ? `${d.comment_count} komentarų` : null),
        image: cover, href: `/diskusijos/${d.slug}`,
        date: d.last_comment_at || d.created_at, badge: 'Diskusija',
        avatar: cover,
        // artist nustatom → prikabinama „nes mėgsti X" (žr. attach loop).
        artist: name ? { id: aid, name, slug: rec?.slug || null } : null,
        meta: { comments: d.comment_count, likes: d.like_count, excerpt: cmt?.body || null, commentBy: cmt?.by || null, commentAvatar: cmt?.avatar || null },
      })
    }
  }

  // chartsTask SĄMONINGAI nebekviečiamas Tau režime: „Atlikėjai topuose" rodo
  // PAMĖGTUS atlikėjus — netinka „Tau gali patikti" (čia DAR nepamėgti).
  await Promise.all([releasesTask(), eventsTask(), topicsTask(), vertaTask(), genresTask(), topTrackTask(), becauseTask()].map(p => p.catch(() => {})))

  // Prikabinam „Nes mėgsti X" prie atlikėjų IR jų leidinių/topų/temų kortelių.
  for (const arr of [queues.artist, queues.release, queues.chart, queues.topic, queues.event]) {
    for (const a of arr) {
      const rid = a.artist?.id
      if (rid && becauseMap.has(rid)) { a.because = becauseMap.get(rid) || null; a.becauseArtists = becauseArtistsMap.get(rid) || null }
    }
  }

  // Atlikėjų kortelėms — vietoj šalies rodom stilius/žanrus + populiariausia daina (inline ▶).
  for (const a of queues.artist) {
    const rid = a.artist?.id
    if (rid && artistGenres.has(rid)) a.subtitle = (artistGenres.get(rid) || []).join(' · ')
    if (rid && topTrackByArtist.has(rid)) a.meta = { ...(a.meta || {}), topTrack: topTrackByArtist.get(rid) }
  }

  return { items: spreadByArtist(weave(queues, limit)), personalized, recommendedCount: recs.length }
}

// Server-side cache — per narį (uid + likedIds + limit auto-keyed). 5 min TTL:
// rekomendacijos nesikeičia akimirksniu, tad nereikia perskaičiuoti kiekvieną
// kartą (RPC + 4 užklausos). Pakeitus pamėgtus → likedIds keičiasi → naujas key.
const getCachedRecs = unstable_cache(
  async (uid: string, likedIds: number[], limit: number) => buildRecs(uid, likedIds, limit),
  ['srautas-recs-v19'],
  { revalidate: 300 },
)

export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') || '45'), 1), 60)

  // Sesija + pamėgti atlikėjai (NEcache'inama — priklauso nuo cookies).
  let uid = ''
  let likedIds: number[] = []
  try {
    const session = await getServerSession(authOptions)
    uid = ((session?.user as any)?.id as string | undefined) || ''
    if (uid) {
      const sb = createAdminClient()
      const { data } = await sb.from('likes').select('entity_id')
        .eq('entity_type', 'artist').eq('user_id', uid).limit(3000)
      likedIds = Array.from(new Set((data || []).map((r: any) => Number(r.entity_id)).filter(Boolean))).sort((a, b) => a - b)
    }
  } catch { /* anon */ }

  const result = await getCachedRecs(uid, likedIds, limit)
  return NextResponse.json(result)
}
