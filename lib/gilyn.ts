// lib/gilyn.ts
//
// GILYN — dienos dėžės muzikos atradimo žaidimas.
//
// Šerdis: visi gauna tą pačią 20 albumų dėžę → laikai VIENĄ vinilą (keiti arba
// praleidi) → dėžės gale jis tampa durimis → 3 kasimosi žingsniai po 3 duris
// (artimas skambesys / ta pati scena / netikėtas tiltas) → dienos kelias
// atidengia asmeninį muzikos žemėlapį (žanrai → substiliai, fog-of-war,
// senų like'ų švyturiai).
//
// Principai (žr. GILYN spec):
//   * jokių populiarumo balų kortelėse — žinomas atlikėjas yra durys, ne prizas
//   * preview savanoriškas (jokių „klausyk 8 s, kad atrakintum")
//   * ryšių paaiškinimai — TIK iš DB faktų (šablonai, ne AI tekstai)
//   * bendruomenės rezultatai rodomi tik PO pasirinkimo
//   * heard ≠ visited ≠ saved — sąžiningos žemėlapio būsenos

import { createAdminClient } from '@/lib/supabase'
import { todayLT } from '@/lib/boombox'
import { mulberry32, seededShuffle, ytIdFromUrl, type GameViewer } from '@/lib/zaidimai'

// ── Konstantos ────────────────────────────────────────────────────────────

export const BOX_SIZE = 20
export const DIG_STEPS = 3
export const GILYN_XP_FINISH = 20        // už užbaigtą dienos run'ą
export const GILYN_XP_NEW_NODE = 2       // už kiekvieną naują žemėlapio mazgą (max 3)

// Tier'ai pagal artists.score (0–100, p50=37 p80=52 p95=66)
const TIER_ANCHOR = 58   // plačiai žinomi
const TIER_MID = 44      // vidutinio žinomumo
const TIER_LESS = 28     // mažiau žinomi, bet prieinami

export type TrackRef = { t: string; y: string }   // title + ytId (kompaktiškai jsonb'e)

export type BoxAlbum = {
  albumId: number
  artistId: number
  title: string
  artist: string
  artistSlug: string | null
  albumSlug: string | null
  year: number | null
  cover: string
  ytId: string | null
  previewTitle: string | null
  tracks?: TrackRef[]
  blurb?: string | null      // trumpas AI/redakcinis albumo pristatymas (pildoma po generavimo)
  genreIds: number[]
  substyleIds: number[]
  country: string | null
  tier: 'anchor' | 'mid' | 'less' | 'wild'
}

export type Door = {
  doorType: 'sound' | 'scene' | 'bridge'
  label: string
  artistId: number
  artist: string
  artistSlug: string | null
  albumId: number | null
  title: string | null
  year: number | null
  cover: string | null
  ytId: string | null
  tracks?: TrackRef[]
  reason: string
}

export type PathNode = {
  step: number
  doorType: Door['doorType'] | 'portal'
  artistId: number
  artist: string
  artistSlug: string | null
  albumId: number | null
  title: string | null
  cover: string | null
  year: number | null
  ytId: string | null
  reason: string | null
}

// ── Pagalbinės ────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function decadeOf(year: number | null): number | null {
  return year ? Math.floor(year / 10) * 10 : null
}

// ── Žanrų / substilių žemėlapiai (in-memory cache per lambda) ─────────────

type Taxonomy = {
  genres: { id: number; name: string }[]
  subById: Map<number, { id: number; name: string; genreId: number | null }>
}
let taxoCache: { at: number; t: Taxonomy } | null = null

export async function loadTaxonomy(): Promise<Taxonomy> {
  if (taxoCache && Date.now() - taxoCache.at < 10 * 60 * 1000) return taxoCache.t
  const sb = createAdminClient()
  const [{ data: genres }, { data: subs }] = await Promise.all([
    sb.from('genres').select('id, name').order('id'),
    sb.from('substyles').select('id, name, genre_id').eq('status', 'approved').limit(1000),
  ])
  const t: Taxonomy = {
    genres: (genres || []).map((g: any) => ({ id: g.id, name: g.name })),
    subById: new Map((subs || []).map((s: any) => [s.id, { id: s.id, name: s.name, genreId: s.genre_id }])),
  }
  taxoCache = { at: Date.now(), t }
  return t
}

/** Trumpi, žaidimui pritaikyti žanrų vardai. */
export function shortGenreName(name: string): string {
  const map: Record<string, string> = {
    'Alternatyvioji muzika': 'Alternatyva',
    'Elektroninė, šokių muzika': 'Elektronika',
    "Hip-hop'o muzika": 'Hip-hopas',
    'Kitų stilių muzika': 'Kiti stiliai',
    'Pop, R&B muzika': 'Pop / R&B',
    'Rimtoji muzika': 'Rimtoji',
    'Roko muzika': 'Rokas',
    'Sunkioji muzika': 'Sunkioji',
  }
  return map[name] || name
}

// ── Atlikėjų meta (žanrai + substiliai + eros) batch fetch ───────────────

type ArtistMeta = {
  genreIds: number[]
  substyleIds: number[]
}

async function fetchArtistMeta(artistIds: number[]): Promise<Map<number, ArtistMeta>> {
  const sb = createAdminClient()
  const out = new Map<number, ArtistMeta>()
  for (const id of artistIds) out.set(id, { genreIds: [], substyleIds: [] })
  for (const ids of chunk(artistIds, 200)) {
    const [{ data: gs }, { data: ss }] = await Promise.all([
      sb.from('artist_genres').select('artist_id, genre_id').in('artist_id', ids).limit(1000),
      sb.from('artist_substyles').select('artist_id, substyle_id').in('artist_id', ids).limit(1000),
    ])
    for (const r of (gs as any[]) || []) out.get(r.artist_id)?.genreIds.push(r.genre_id)
    for (const r of (ss as any[]) || []) out.get(r.artist_id)?.substyleIds.push(r.substyle_id)
  }
  return out
}

/** Kiekvienam albumui — iki `per` YT track'ų (grotuvo playlist'ui), albumo tvarka. */
export async function fetchAlbumTracklists(albumIds: number[], per = 10): Promise<Map<number, TrackRef[]>> {
  const sb = createAdminClient()
  const out = new Map<number, TrackRef[]>()
  for (const ids of chunk(albumIds, 100)) {
    const { data } = await sb
      .from('album_tracks')
      .select('album_id, position, tracks:track_id!inner ( id, title, video_url, video_views, video_embeddable )')
      .in('album_id', ids)
      .not('tracks.video_url', 'is', null)
      .order('position', { ascending: true, nullsFirst: false })
      .limit(1000)
    for (const r of (data as any[]) || []) {
      const t = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
      if (!t?.video_url || t.video_embeddable === false) continue
      const y = ytIdFromUrl(t.video_url)
      if (!y) continue
      const list = out.get(r.album_id) || []
      if (list.length < per && !list.some(x => x.y === y)) {
        list.push({ t: t.title, y })
        out.set(r.album_id, list)
      }
    }
  }
  return out
}

/** Lazy backfill: senos gilyn_days eilutės be tracks[] gauna playlist'us. */
export async function enrichBoxTracks(day: string, box: BoxAlbum[]): Promise<BoxAlbum[]> {
  if (box.length && box[0].tracks) return box
  const lists = await fetchAlbumTracklists(box.map(b => b.albumId))
  const enriched = box.map(b => ({ ...b, tracks: lists.get(b.albumId) || (b.ytId ? [{ t: b.previewTitle || b.title, y: b.ytId }] : []) }))
  const sb = createAdminClient()
  await sb.from('gilyn_days').update({ albums: enriched }).eq('day', day)
  return enriched
}

/** Kiekvienam albumui — geriausias YT track'as (preview). */
async function fetchAlbumPreviews(albumIds: number[]): Promise<Map<number, { ytId: string; title: string }>> {
  const sb = createAdminClient()
  const out = new Map<number, { ytId: string; title: string }>()
  for (const ids of chunk(albumIds, 120)) {
    const { data } = await sb
      .from('album_tracks')
      .select('album_id, tracks:track_id!inner ( id, title, video_url, video_views, video_embeddable )')
      .in('album_id', ids)
      .not('tracks.video_url', 'is', null)
      .limit(1000)
    const best = new Map<number, { views: number; ytId: string; title: string }>()
    for (const r of (data as any[]) || []) {
      const t = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
      if (!t?.video_url || t.video_embeddable === false) continue
      const ytId = ytIdFromUrl(t.video_url)
      if (!ytId) continue
      const views = t.video_views || 0
      const cur = best.get(r.album_id)
      if (!cur || views > cur.views) best.set(r.album_id, { views, ytId, title: t.title })
    }
    for (const [aid, b] of best) out.set(aid, { ytId: b.ytId, title: b.title })
  }
  return out
}

// ── DIENOS DĖŽĖS GENERAVIMAS ──────────────────────────────────────────────
//
// Deterministinis (seed = data). Sudėtis: 4 anchor + 8 mid + 6 less + 2 wild.
// Taisyklės: unikalus atlikėjas, joks žanras >6, ≥5 dešimtmečiai (soft),
// ≥2 LT atlikėjai, be paskutinių 30 d. albumų/atlikėjų, tik su viršeliu,
// metais ir YT preview.

type Candidate = {
  albumId: number
  artistId: number
  title: string
  albumSlug: string | null
  year: number
  cover: string
  artist: string
  artistSlug: string | null
  country: string | null
  artistScore: number
}

async function fetchTierCandidates(minScore: number, maxScore: number | null, limit: number): Promise<Candidate[]> {
  const sb = createAdminClient()
  let q = sb
    .from('albums')
    .select('id, artist_id, title, slug, year, cover_image_url, artists:artist_id!inner ( id, name, slug, country, score )')
    .not('cover_image_url', 'is', null)
    .not('year', 'is', null)
    .eq('type_studio', true)
    .or('is_upcoming.is.null,is_upcoming.eq.false')
    .gte('artists.score', minScore)
  if (maxScore !== null) q = q.lt('artists.score', maxScore)
  const { data } = await q.order('id', { ascending: true }).limit(limit)
  const out: Candidate[] = []
  for (const r of (data as any[]) || []) {
    const a = Array.isArray(r.artists) ? r.artists[0] : r.artists
    if (!a?.name || !r.cover_image_url) continue
    out.push({
      albumId: r.id, artistId: a.id, title: r.title, albumSlug: r.slug || null,
      year: r.year, cover: r.cover_image_url, artist: a.name, artistSlug: a.slug || null,
      country: a.country || null, artistScore: a.score || 0,
    })
  }
  return out
}

/** Sugeneruoja (arba grąžina jau egzistuojančią) dienos dėžę. */
export async function ensureDayBox(day: string): Promise<BoxAlbum[]> {
  const sb = createAdminClient()
  const { data: existing } = await sb.from('gilyn_days').select('albums').eq('day', day).maybeSingle()
  if (existing?.albums) return existing.albums as BoxAlbum[]

  const rng = mulberry32(hashStr(`gilyn|${day}`))

  // Paskutinių 30 d. albumai/atlikėjai — kartojimosi prevencija
  const { data: recent } = await sb
    .from('gilyn_days').select('albums')
    .gte('day', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    .limit(31)
  const usedAlbums = new Set<number>()
  const usedArtists = new Set<number>()
  for (const d of (recent as any[]) || []) {
    for (const a of (d.albums as BoxAlbum[]) || []) { usedAlbums.add(a.albumId); usedArtists.add(a.artistId) }
  }

  // Kandidatai pagal tier'us (deterministinė tvarka + seeded shuffle)
  const [anchors, mids, lows] = await Promise.all([
    fetchTierCandidates(TIER_ANCHOR, null, 900),
    fetchTierCandidates(TIER_MID, TIER_ANCHOR, 1000),
    fetchTierCandidates(TIER_LESS, TIER_MID, 1000),
  ])
  const pools: { tier: BoxAlbum['tier']; want: number; list: Candidate[] }[] = [
    { tier: 'anchor', want: 4, list: seededShuffle(anchors, rng) },
    { tier: 'mid', want: 8, list: seededShuffle(mids, rng) },
    { tier: 'less', want: 6, list: seededShuffle(lows, rng) },
    { tier: 'wild', want: 2, list: seededShuffle([...lows, ...mids], rng) },
  ]

  // Meta + preview žingsniais: imam kandidatų „bangą", tikrinam YT, pildom
  const picked: (Candidate & { tier: BoxAlbum['tier'] })[] = []
  const pickedArtists = new Set<number>()
  const genreCount = new Map<number, number>()
  const decades = new Set<number>()
  let ltCount = 0

  for (const pool of pools) {
    let taken = 0
    // pirmas praėjimas — su visais apribojimais; antras — atlaisvintas (kad visada surinktume 20)
    for (const relax of [false, true]) {
      if (taken >= pool.want) break
      const wave = pool.list.filter(c =>
        !pickedArtists.has(c.artistId) && !usedAlbums.has(c.albumId) &&
        (relax || !usedArtists.has(c.artistId)),
      ).slice(0, 120)
      if (!wave.length) continue
      const meta = await fetchArtistMeta([...new Set(wave.map(c => c.artistId))])
      const previews = await fetchAlbumPreviews(wave.map(c => c.albumId))
      for (const c of wave) {
        if (taken >= pool.want) break
        if (pickedArtists.has(c.artistId)) continue
        if (!previews.has(c.albumId)) continue
        const m = meta.get(c.artistId)
        const mainGenre = m?.genreIds[0]
        if (!relax && mainGenre && (genreCount.get(mainGenre) || 0) >= 6) continue
        // LT kvota: paskutinėse vietose prioritetas LT, jei jų dar nėra 2
        const slotsLeft = 20 - picked.length
        const ltNeeded = Math.max(0, 2 - ltCount)
        if (!relax && ltNeeded >= slotsLeft && c.country !== 'Lietuva') continue
        picked.push({ ...c, tier: pool.tier })
        pickedArtists.add(c.artistId)
        if (mainGenre) genreCount.set(mainGenre, (genreCount.get(mainGenre) || 0) + 1)
        const d = decadeOf(c.year); if (d) decades.add(d)
        if (c.country === 'Lietuva') ltCount++
        taken++
      }
    }
  }

  // Jei vis tiek <20 — dopildom iš bet kur (be tier kvotų)
  if (picked.length < BOX_SIZE) {
    const extra = seededShuffle([...anchors, ...mids, ...lows], rng)
      .filter(c => !pickedArtists.has(c.artistId) && !usedAlbums.has(c.albumId)).slice(0, 150)
    const previews = await fetchAlbumPreviews(extra.map(c => c.albumId))
    for (const c of extra) {
      if (picked.length >= BOX_SIZE) break
      if (!previews.has(c.albumId) || pickedArtists.has(c.artistId)) continue
      picked.push({ ...c, tier: 'wild' })
      pickedArtists.add(c.artistId)
    }
  }

  const final = picked.slice(0, BOX_SIZE)
  const metaAll = await fetchArtistMeta(final.map(c => c.artistId))
  const prevAll = await fetchAlbumPreviews(final.map(c => c.albumId))
  const listsAll = await fetchAlbumTracklists(final.map(c => c.albumId))
  const box: BoxAlbum[] = seededShuffle(final, rng).map(c => ({
    albumId: c.albumId, artistId: c.artistId, title: c.title, artist: c.artist,
    artistSlug: c.artistSlug, albumSlug: c.albumSlug, year: c.year, cover: c.cover,
    ytId: prevAll.get(c.albumId)?.ytId || null,
    previewTitle: prevAll.get(c.albumId)?.title || null,
    tracks: listsAll.get(c.albumId) || [],
    genreIds: metaAll.get(c.artistId)?.genreIds || [],
    substyleIds: metaAll.get(c.artistId)?.substyleIds || [],
    country: c.country, tier: c.tier,
  }))

  // Upsert (race-safe: jei kitas request'as suspėjo pirmas — imam jo versiją)
  const { error } = await sb.from('gilyn_days').insert({ day, albums: box })
  if (error) {
    const { data: again } = await sb.from('gilyn_days').select('albums').eq('day', day).maybeSingle()
    if (again?.albums) return again.albums as BoxAlbum[]
  }
  return box
}

/** Asmeninė (stabili) dėžės tvarka — visi gauna tuos pačius albumus, skirtinga eile. */
export function personalOrder(box: BoxAlbum[], day: string, viewerKey: string): BoxAlbum[] {
  const rng = mulberry32(hashStr(`gilyn-order|${day}|${viewerKey}`))
  return seededShuffle(box, rng)
}

// ── Asmeniniai statusai dėžės kortelėms ──────────────────────────────────

export type PersonalStatus = 'liked_album' | 'liked_artist' | 'near' | 'new'

export async function fetchViewerLikes(viewer: GameViewer): Promise<{
  artistIds: Set<number>; albumIds: Set<number>; trackArtistIds: Set<number>
  counts: { artists: number; albums: number; tracks: number }
}> {
  const sb = createAdminClient()
  const empty = { artistIds: new Set<number>(), albumIds: new Set<number>(), trackArtistIds: new Set<number>(), counts: { artists: 0, albums: 0, tracks: 0 } }
  if (!viewer.userId && !viewer.anonId) return empty
  const f = (q: any) => viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
  const [aRes, alRes, tRes] = await Promise.all([
    f(sb.from('likes').select('entity_id').eq('entity_type', 'artist')).limit(800),
    f(sb.from('likes').select('entity_id').eq('entity_type', 'album')).limit(600),
    f(sb.from('likes').select('entity_id').eq('entity_type', 'track')).limit(600),
  ])
  const artistIds = new Set<number>(((aRes.data as any[]) || []).map(r => r.entity_id))
  const albumIds = new Set<number>(((alRes.data as any[]) || []).map(r => r.entity_id))
  // track like'ai → atlikėjai (žemėlapio švyturiams)
  const trackIds = (((tRes.data as any[]) || []).map(r => r.entity_id)).slice(0, 400)
  const trackArtistIds = new Set<number>()
  for (const ids of chunk(trackIds, 200)) {
    const { data } = await sb.from('tracks').select('artist_id').in('id', ids).limit(400)
    for (const r of (data as any[]) || []) if (r.artist_id) trackArtistIds.add(r.artist_id)
  }
  return {
    artistIds, albumIds, trackArtistIds,
    counts: { artists: artistIds.size, albums: albumIds.size, tracks: trackIds.length },
  }
}

/** „Netoli tavo teritorijos" — ar albumo atlikėjo substiliai kertasi su pamėgtų atlikėjų substiliais. */
export async function computeBoxStatuses(
  box: BoxAlbum[], likes: Awaited<ReturnType<typeof fetchViewerLikes>>,
): Promise<Map<number, PersonalStatus>> {
  const out = new Map<number, PersonalStatus>()
  let likedSubs: Set<number> | null = null
  if (likes.artistIds.size) {
    const sb = createAdminClient()
    likedSubs = new Set<number>()
    const ids = [...likes.artistIds].slice(0, 400)
    for (const part of chunk(ids, 200)) {
      const { data } = await sb.from('artist_substyles').select('substyle_id').in('artist_id', part).limit(1000)
      for (const r of (data as any[]) || []) likedSubs.add(r.substyle_id)
    }
  }
  for (const a of box) {
    if (likes.albumIds.has(a.albumId)) out.set(a.albumId, 'liked_album')
    else if (likes.artistIds.has(a.artistId) || likes.trackArtistIds.has(a.artistId)) out.set(a.albumId, 'liked_artist')
    else if (likedSubs && a.substyleIds.some(s => likedSubs!.has(s))) out.set(a.albumId, 'near')
    else out.set(a.albumId, 'new')
  }
  return out
}

// ── KASIMOSI DURYS ────────────────────────────────────────────────────────

type FullArtist = {
  id: number; name: string; slug: string | null; country: string | null
  score: number; genreIds: number[]; substyleIds: number[]
  eraLo: number | null; eraHi: number | null
}

async function loadFullArtist(artistId: number): Promise<FullArtist | null> {
  const sb = createAdminClient()
  const [{ data: a }, meta, { data: yrs }] = await Promise.all([
    sb.from('artists').select('id, name, slug, country, score').eq('id', artistId).maybeSingle(),
    fetchArtistMeta([artistId]),
    sb.from('albums').select('year').eq('artist_id', artistId).not('year', 'is', null).order('year', { ascending: true }).limit(200),
  ])
  if (!a) return null
  const years = ((yrs as any[]) || []).map(r => r.year)
  const m = meta.get(artistId)!
  return {
    id: a.id, name: a.name, slug: a.slug || null, country: a.country || null,
    score: a.score || 0, genreIds: m.genreIds, substyleIds: m.substyleIds,
    eraLo: years.length ? years[0] : null, eraHi: years.length ? years[years.length - 1] : null,
  }
}

function eraOverlapScore(a: FullArtist, lo: number | null, hi: number | null): number {
  if (!a.eraLo || !a.eraHi || !lo || !hi) return 0
  const oLo = Math.max(a.eraLo, lo), oHi = Math.min(a.eraHi, hi)
  if (oHi < oLo) return 0
  const span = Math.max(1, Math.max(a.eraHi, hi) - Math.min(a.eraLo, lo))
  return ((oHi - oLo) / span) * 40
}

function fameProx(a: number, b: number): number {
  const fa = Math.max(1, a), fb = Math.max(1, b)
  return Math.exp(-Math.abs(Math.log(fa) - Math.log(fb)) / 1.2)
}

/** Kandidato reprezentacinis albumas (viršelis būtinas, YT — bonusas). */
async function pickDoorAlbums(artistIds: number[]): Promise<Map<number, { albumId: number; title: string; year: number | null; cover: string; ytId: string | null }>> {
  const sb = createAdminClient()
  const out = new Map<number, { albumId: number; title: string; year: number | null; cover: string; ytId: string | null }>()
  if (!artistIds.length) return out
  const { data } = await sb
    .from('albums')
    .select('id, artist_id, title, year, cover_image_url, score, type_studio')
    .in('artist_id', artistIds)
    .not('cover_image_url', 'is', null)
    .or('is_upcoming.is.null,is_upcoming.eq.false')
    .limit(600)
  const byArtist = new Map<number, any[]>()
  for (const r of (data as any[]) || []) {
    if (!byArtist.has(r.artist_id)) byArtist.set(r.artist_id, [])
    byArtist.get(r.artist_id)!.push(r)
  }
  const chosen: { artistId: number; albumId: number; title: string; year: number | null; cover: string }[] = []
  for (const [aid, rows] of byArtist) {
    rows.sort((x, y) => (y.score || 0) - (x.score || 0) || (y.type_studio ? 1 : 0) - (x.type_studio ? 1 : 0) || (x.year || 9999) - (y.year || 9999))
    const b = rows[0]
    chosen.push({ artistId: aid, albumId: b.id, title: b.title, year: b.year || null, cover: b.cover_image_url })
  }
  const previews = await fetchAlbumPreviews(chosen.map(c => c.albumId))
  for (const c of chosen) {
    out.set(c.artistId, { albumId: c.albumId, title: c.title, year: c.year, cover: c.cover, ytId: previews.get(c.albumId)?.ytId || null })
  }
  return out
}

/**
 * Sugeneruoja 3 duris iš dabartinio kelio taško.
 * exclude — atlikėjai, kurių NEgalima siūlyti (kelias, dėžė, jau rodyti).
 * likedArtists — personalizacija: jei kandidatas jau pamėgtas ir yra alternatyvų,
 * imamas gilesnis tos pačios krypties variantas.
 */
export async function generateDoors(opts: {
  currentArtistId: number
  exclude: Set<number>
  likedArtists: Set<number>
  visitedArtists: Set<number>
  seed: string
}): Promise<Door[]> {
  const sb = createAdminClient()
  const taxo = await loadTaxonomy()
  const cur = await loadFullArtist(opts.currentArtistId)
  if (!cur) return []
  const rng = mulberry32(hashStr(`gilyn-doors|${opts.seed}`))
  const skip = (id: number) => id === cur.id || opts.exclude.has(id)

  // ── A. ARTIMAS SKAMBESYS — substilių persidengimas ──
  const soundCands = new Map<number, number>() // artistId → substyle overlap
  if (cur.substyleIds.length) {
    const { data } = await sb
      .from('artist_substyles').select('artist_id, substyle_id')
      .in('substyle_id', cur.substyleIds.slice(0, 12))
      .neq('artist_id', cur.id)
      .limit(1000)
    for (const r of (data as any[]) || []) {
      if (skip(r.artist_id)) continue
      soundCands.set(r.artist_id, (soundCands.get(r.artist_id) || 0) + 1)
    }
  }
  // fallback: bendras žanras, jei substilių nėra
  if (soundCands.size < 3 && cur.genreIds.length) {
    const { data } = await sb
      .from('artist_genres').select('artist_id').eq('genre_id', cur.genreIds[0]).neq('artist_id', cur.id).limit(600)
    for (const r of (data as any[]) || []) if (!skip(r.artist_id) && !soundCands.has(r.artist_id)) soundCands.set(r.artist_id, 0.5)
  }

  // ── B. TA PATI SCENA — šalis + era; arba bendri grupės nariai ──
  let memberLink: { artistId: number; kind: 'group' | 'member' } | null = null
  {
    const [{ data: asGroup }, { data: asMember }] = await Promise.all([
      sb.from('artist_members').select('member_id').eq('group_id', cur.id).limit(20),
      sb.from('artist_members').select('group_id').eq('member_id', cur.id).limit(20),
    ])
    const links: { artistId: number; kind: 'group' | 'member' }[] = []
    for (const r of (asGroup as any[]) || []) if (!skip(r.member_id)) links.push({ artistId: r.member_id, kind: 'member' })
    for (const r of (asMember as any[]) || []) if (!skip(r.group_id)) links.push({ artistId: r.group_id, kind: 'group' })
    if (links.length) memberLink = links[Math.floor(rng() * links.length)]
  }
  const sceneCands: number[] = []
  if (cur.country) {
    const { data } = await sb
      .from('artists').select('id, score')
      .eq('country', cur.country)
      .neq('id', cur.id)
      .gt('score', 15)
      .order('score', { ascending: false })
      .limit(400)
    for (const r of (data as any[]) || []) if (!skip(r.id)) sceneCands.push(r.id)
  }

  // ── C. NETIKĖTAS TILTAS — co-like į kitą žanrą ──
  const bridgeCands: { artistId: number; cnt: number }[] = []
  {
    const { data } = await sb.rpc('gilyn_colike_artists', { p_artist: cur.id, p_limit: 14 })
    for (const r of (data as any[]) || []) if (!skip(r.artist_id)) bridgeCands.push({ artistId: r.artist_id, cnt: r.cnt })
  }

  // Bendras kandidatų meta (žanrai/substiliai/era/fame) — vienu batch'u
  const allIds = [...new Set([
    ...[...soundCands.keys()].slice(0, 60),
    ...sceneCands.slice(0, 60),
    ...bridgeCands.map(b => b.artistId),
    ...(memberLink ? [memberLink.artistId] : []),
  ])]
  const metaAll = await fetchArtistMeta(allIds)
  const { data: artRows } = allIds.length
    ? await sb.from('artists').select('id, name, slug, country, score, active_from, cover_image_url').in('id', allIds.slice(0, 200)).limit(200)
    : { data: [] as any[] }
  const artById = new Map<number, any>(((artRows as any[]) || []).map(r => [r.id, r]))

  const doors: Door[] = []
  const usedDoorArtists = new Set<number>()
  const curGenres = new Set(cur.genreIds)

  const rankPersonalized = <T,>(cands: T[], getId: (c: T) => number): T[] => {
    // pamėgti/aplankyti — į galą (ekspertas gauna gilesnį variantą)
    return [...cands].sort((x, y) => {
      const fx = (opts.likedArtists.has(getId(x)) || opts.visitedArtists.has(getId(x))) ? 1 : 0
      const fy = (opts.likedArtists.has(getId(y)) || opts.visitedArtists.has(getId(y))) ? 1 : 0
      return fx - fy
    })
  }

  // A durys — substilių persidengimas + eros artumas + fame proximity
  {
    const scored = [...soundCands.entries()]
      .filter(([id]) => artById.has(id))
      .map(([id, overlap]) => {
        const a = artById.get(id)
        const meta = metaAll.get(id) || { genreIds: [], substyleIds: [] }
        const sameCountry = a.country && a.country === cur.country ? 10 : 0
        // eros artumas pagal active_from (grubu, bet pigu): ±15 m. dar artima
        const eraProx = (a.active_from && cur.eraLo)
          ? Math.exp(-Math.abs(a.active_from - cur.eraLo) / 15) * 30
          : 0
        const base = overlap * 100 + sameCountry + eraProx
        return { id, score: base * (0.5 + 0.5 * fameProx(a.score || 1, cur.score || 1)), overlap, meta }
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 8)
    const ranked = rankPersonalized(scored, c => c.id)
    const pick = ranked[0]
    if (pick) {
      const a = artById.get(pick.id)
      const sharedSub = pick.meta.substyleIds.find(s => cur.substyleIds.includes(s))
      const subName = sharedSub ? taxo.subById.get(sharedSub)?.name : null
      doors.push({
        doorType: 'sound', label: 'ARTIMAS SKAMBESYS',
        artistId: pick.id, artist: a.name, artistSlug: a.slug || null,
        albumId: null, title: null, year: null, cover: null, ytId: null,
        reason: subName ? `Panašus skambesys — ${subName}.` : 'Stilistiškai artimiausia kryptis.',
      })
      usedDoorArtists.add(pick.id)
    }
  }

  // B durys
  {
    let placed = false
    if (memberLink && !usedDoorArtists.has(memberLink.artistId) && artById.has(memberLink.artistId)) {
      const a = artById.get(memberLink.artistId)
      doors.push({
        doorType: 'scene', label: 'TIESIOGINIS RYŠYS',
        artistId: a.id, artist: a.name, artistSlug: a.slug || null,
        albumId: null, title: null, year: null, cover: null, ytId: null,
        reason: memberLink.kind === 'member'
          ? `${a.name} — ${cur.name} narys.`
          : `${cur.name} yra ${a.name} sudėtyje.`,
      })
      usedDoorArtists.add(a.id)
      placed = true
    }
    if (!placed) {
      // Scena = šalis + BENDRAS ŽANRAS (ne bet koks tautietis) + eros artumas
      const scoredAll = sceneCands
        .filter(id => artById.has(id) && !usedDoorArtists.has(id))
        .map(id => {
          const a = artById.get(id)
          const meta = metaAll.get(id) || { genreIds: [], substyleIds: [] }
          const sharedGenre = meta.genreIds.some(g => curGenres.has(g))
          const eraProx = (a.active_from && cur.eraLo)
            ? Math.exp(-Math.abs(a.active_from - cur.eraLo) / 12) * 40
            : 0
          return { id, sharedGenre, score: eraProx + (a.score || 0) / 10 + (sharedGenre ? 50 : 0) }
        })
        .sort((x, y) => y.score - x.score)
      const withGenre = scoredAll.filter(c => c.sharedGenre)
      const pool2 = (withGenre.length ? withGenre : scoredAll).slice(0, 8)
      const ranked = rankPersonalized(pool2, c => c.id)
      const pick = ranked[0]
      if (pick) {
        const a = artById.get(pick.id)
        const gId = (metaAll.get(pick.id)?.genreIds || []).find(g => curGenres.has(g))
        const gName = gId ? shortGenreName(taxo.genres.find(x => x.id === gId)?.name || '') : null
        doors.push({
          doorType: 'scene', label: 'TA PATI SCENA',
          artistId: pick.id, artist: a.name, artistSlug: a.slug || null,
          albumId: null, title: null, year: null, cover: null, ytId: null,
          reason: gName ? `${cur.country} — ta pati scena, irgi ${gName.toLowerCase()}.` : `${cur.country} — ta pati scena.`,
        })
        usedDoorArtists.add(pick.id)
      }
    }
  }

  // C durys — TIKRAS tiltas: kitas žanras IR be substilių persidengimo (jei įmanoma)
  {
    const curSubs = new Set(cur.substyleIds)
    const valid = bridgeCands.filter(b => !usedDoorArtists.has(b.artistId) && artById.has(b.artistId))
    const otherGenre = valid.filter(b => {
      const g = metaAll.get(b.artistId)?.genreIds || []
      return g.length > 0 && !g.some(x => curGenres.has(x))
    })
    const farBridge = otherGenre.filter(b => {
      const s = metaAll.get(b.artistId)?.substyleIds || []
      return !s.some(x => curSubs.has(x))
    })
    const pool = farBridge.length ? farBridge : otherGenre.length ? otherGenre : valid
    const ranked = rankPersonalized(pool, c => c.artistId)
    const pick = ranked[0]
    if (pick) {
      const a = artById.get(pick.artistId)
      // posūkio kryptis: kandidato SUBSTILIUS (konkretiau nei makro žanras)
      const subId = (metaAll.get(pick.artistId)?.substyleIds || []).find(s => taxo.subById.get(s)?.name)
      const subName = subId ? taxo.subById.get(subId)?.name : null
      const g = (metaAll.get(pick.artistId)?.genreIds || [])[0]
      const gName = g ? shortGenreName(taxo.genres.find(x => x.id === g)?.name || '') : null
      const target = subName || gName
      doors.push({
        doorType: 'bridge', label: 'NETIKĖTAS POSŪKIS',
        artistId: pick.artistId, artist: a.name, artistSlug: a.slug || null,
        albumId: null, title: null, year: null, cover: null, ytId: null,
        reason: target
          ? `${cur.name} gerbėjai mėgsta ir šį — posūkis į ${target}.`
          : `Tą patį mėgsta ir ${cur.name} klausytojai.`,
      })
      usedDoorArtists.add(pick.artistId)
    }
  }

  // Atsarginiai kandidatai — kad po medijos filtro VISADA liktų 3 durys
  const backups: Door[] = []
  const backupIds = [
    ...[...soundCands.keys()].filter(id => artById.has(id) && !usedDoorArtists.has(id)).slice(0, 4),
    ...sceneCands.filter(id => artById.has(id) && !usedDoorArtists.has(id)).slice(0, 2),
    ...bridgeCands.map(b => b.artistId).filter(id => artById.has(id) && !usedDoorArtists.has(id)).slice(0, 2),
  ]
  for (const id of [...new Set(backupIds)].slice(0, 5)) {
    const a = artById.get(id)
    backups.push({
      doorType: 'sound', label: 'ARTIMA KRYPTIS',
      artistId: id, artist: a.name, artistSlug: a.slug || null,
      albumId: null, title: null, year: null, cover: null, ytId: null,
      reason: 'Artima muzikinė kryptis.',
    })
  }

  // Medija: reprezentacinis albumas (viršelis + playlist); jei nėra albumo su
  // viršeliu — fallback į atlikėjo foto + populiariausią jo YT dainą.
  const ordered = [...doors, ...backups]
  const albums = await pickDoorAlbums(ordered.map(d => d.artistId))
  const lists = await fetchAlbumTracklists([...albums.values()].map(a => a.albumId))
  const noAlbum = ordered.filter(d => !albums.has(d.artistId)).map(d => d.artistId)
  const topTrack = new Map<number, TrackRef>()
  if (noAlbum.length) {
    const { data } = await sb
      .from('tracks').select('artist_id, title, video_url, video_views')
      .in('artist_id', noAlbum.slice(0, 20))
      .not('video_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(60)
    for (const r of (data as any[]) || []) {
      const y = ytIdFromUrl(r.video_url)
      if (y && !topTrack.has(r.artist_id)) topTrack.set(r.artist_id, { t: r.title, y })
    }
  }
  const final: Door[] = []
  for (const d of ordered) {
    if (final.length >= 3) break
    const al = albums.get(d.artistId)
    if (al) {
      final.push({
        ...d, albumId: al.albumId, title: al.title, year: al.year, cover: al.cover, ytId: al.ytId,
        tracks: lists.get(al.albumId) || (al.ytId ? [{ t: al.title, y: al.ytId }] : []),
      })
    } else {
      const a = artById.get(d.artistId)
      const tt = topTrack.get(d.artistId)
      if (a?.cover_image_url) {
        final.push({ ...d, albumId: null, title: null, year: null, cover: a.cover_image_url, ytId: tt?.y || null, tracks: tt ? [tt] : [] })
      }
    }
  }
  return final
}

function stripText(html: string | null | undefined, max = 340): string | null {
  let t = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t) return null
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…'
  return t
}

/** On-demand AI albumo pristatymas (Haiku) su DB cache — apie skambesį/vietą žanre, ne biografija. */
export async function getAlbumBlurb(albumId: number): Promise<string | null> {
  const sb = createAdminClient()
  const { data: cached } = await sb.from('gilyn_album_blurbs').select('blurb').eq('album_id', albumId).maybeSingle()
  if (cached?.blurb) return cached.blurb
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const { data: alb } = await sb
    .from('albums')
    .select('title, year, artists:artist_id ( name, country )')
    .eq('id', albumId).maybeSingle()
  if (!alb) return null
  const a: any = Array.isArray((alb as any).artists) ? (alb as any).artists[0] : (alb as any).artists
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Parašyk VIENĄ lietuvišką sakinį (100–180 simbolių) apie muzikos albumą: ${a?.name || '?'} — „${(alb as any).title}“ (${(alb as any).year || '?'}${a?.country ? `, ${a.country}` : ''}). Apie PATĮ ALBUMĄ: skambesį, nuotaiką, vietą atlikėjo kelyje ar žanro istorijoje. NE atlikėjo biografija. Jokių išgalvotų faktų — jei albumo nežinai, apibūdink atsargiai per stilių ir erą. Tonas smalsus, be „geras/blogas“ vertinimų. Atsakyk TIK sakiniu.`,
        }],
      }),
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const blurb = String(data.content?.[0]?.text || '').trim()
    if (!blurb || blurb.length < 30) return null
    await sb.from('gilyn_album_blurbs').insert({ album_id: albumId, blurb }).select('album_id')
    return blurb
  } catch { return null }
}

/** Kasimosi hero kontekstas: ALBUMO aprašymas (fallback — atlikėjo bio) + atlikėjo top dainos. */
export async function artistNodeInfo(artistId: number, albumId?: number | null): Promise<{
  albumDesc: string | null; bio: string | null; country: string | null; years: string | null
  artistTop: TrackRef[]
}> {
  const sb = createAdminClient()
  const [{ data: a }, aiBlurb, topRes] = await Promise.all([
    sb.from('artists').select('description, country, active_from, active_until').eq('id', artistId).maybeSingle(),
    albumId ? getAlbumBlurb(albumId) : Promise.resolve(null),
    sb.from('tracks').select('title, video_url, video_views, video_embeddable')
      .eq('artist_id', artistId)
      .not('video_url', 'is', null)
      .order('video_views', { ascending: false, nullsFirst: false })
      .limit(24),
  ])
  const artistTop: TrackRef[] = []
  for (const r of ((topRes as any).data as any[]) || []) {
    if (r.video_embeddable === false) continue
    const y = ytIdFromUrl(r.video_url)
    if (y && !artistTop.some(t => t.y === y) && artistTop.length < 10) artistTop.push({ t: r.title, y })
  }
  const years = a?.active_from ? `${a.active_from}–${a.active_until || 'dabar'}` : null
  return {
    albumDesc: aiBlurb,                      // TIK AI albumo pristatymas (legacy description dažnai — apie atlikėją)
    bio: stripText(a?.description, 300),
    country: a?.country || null,
    years,
    artistTop,
  }
}

// ── ŽEMĖLAPIS ─────────────────────────────────────────────────────────────

export type MapRegion = {
  genreId: number
  /** Pasaulio raktas (gilyn_worlds.id) — v3 žemėlapyje regionas = pasaulis. */
  worldId?: string
  name: string
  color?: string
  substyles: {
    /** v3: teritorijos tekstinis ID (gilyn_terr.id). */
    id: number | string
    name: string; size?: number
    era?: string | null; region?: string | null; essence?: string | null
    /** Kiek žinomų (AI fame ≥3) atlikėjų — ar teritoriją apskritai galima tyrinėti. */
    known?: number
    /** Kiek žinomų atlikėjų dar trūksta bazėje (spraga, ne klaida). */
    missing?: number
    beacons: number; visited: number; heard: number; saved: number
    artists: { id: number; n: string; k: 'saved' | 'visited' | 'beacon'; img?: string | null }[]
    top?: { id: number; n: string; img?: string | null }[]
    /** Kaimyninės teritorijos — „kur eiti toliau". */
    near?: { id: string; n: string }[]
  }[]
  beacons: number
  visited: number
}

// ── Scenos (substilius × šalis × dešimtmetis klasteriai iš gilyn_scenes) ──

type SceneRow = { id: number; substyle_id: number; country: string | null; decade: number; n: number; artist_ids: number[] }
let sceneCache: { at: number; rows: SceneRow[] } | null = null

async function loadScenes(): Promise<SceneRow[]> {
  if (sceneCache && Date.now() - sceneCache.at < 10 * 60 * 1000) return sceneCache.rows
  const sb = createAdminClient()
  const { data } = await sb.from('gilyn_scenes').select('id, substyle_id, country, decade, n, artist_ids').limit(1000)
  sceneCache = { at: Date.now(), rows: ((data as any[]) || []) as SceneRow[] }
  return sceneCache.rows
}

export function sceneName(subName: string, country: string | null, decade: number): string {
  return `${subName} · ${country || 'pasaulis'} · ${String(decade).slice(2, 3)}0-ieji`
}

/** Scenos ID žemėlapio vienetui (kad nesikirstų su substilių ID). */
export const SCENE_ID_BASE = 1000000

// ── Teritorijos v3 (gilyn_worlds + gilyn_terr + gilyn_artist_terr) ────────
//
// Taksonomija autorinta iš muzikos žinojimo, ne iš substilių tagų. Atlikėjas
// priklauso kelioms teritorijoms skirtingais laikotarpiais (Radiohead: Britpop
// 93–95 → Alternatyva 95–99 → Elektroninis rokas 00–11).
//
// „Žinomumas" = artist_fame (AI, 1–5), NE music.lt like'ai — kitaip klasika ir
// džiazas atrodytų tušti vien todėl, kad portalo auditorija klauso roko.

export type WorldRow = { id: string; name: string; color: string | null; sort: number }
export type TerrV3 = {
  id: string; world_id: string; name: string
  era_from: number | null; era_to: number | null
  region: string | null; essence: string | null
  n_artists: number; n_known: number; n_missing: number; status: string
}

type TerrCache = {
  at: number
  worlds: WorldRow[]
  terrs: TerrV3[]
  members: Map<string, { artistId: number; from: number | null; to: number | null }[]>
  near: Map<string, { id: string; n: string }[]>
  fame: Map<number, number>
}
let v3Cache: TerrCache | null = null

async function loadV3(): Promise<TerrCache> {
  if (v3Cache && Date.now() - v3Cache.at < 10 * 60 * 1000) return v3Cache
  const sb = createAdminClient()

  const [{ data: worlds }, { data: terrs }, { data: edges }] = await Promise.all([
    sb.from('gilyn_worlds').select('id, name, color, sort').order('sort'),
    sb.from('gilyn_terr').select('id, world_id, name, era_from, era_to, region, essence, n_artists, n_known, n_missing, status')
      .neq('status', 'drop').limit(700),
    sb.from('gilyn_terr_edges').select('a_id, b_id, weight').order('weight', { ascending: false }).limit(4000),
  ])

  // Nariai — puslapiuojam, nes priskyrimų ~13k
  const members = new Map<string, { artistId: number; from: number | null; to: number | null }[]>()
  for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('gilyn_artist_terr')
      .select('artist_id, terr_id, year_from, year_to')
      .range(off, off + 999)
    if (!data?.length) break
    for (const r of data as any[]) {
      const arr = members.get(r.terr_id) || []
      arr.push({ artistId: r.artist_id, from: r.year_from, to: r.year_to })
      members.set(r.terr_id, arr)
    }
    if (data.length < 1000) break
  }

  const fame = new Map<number, number>()
  for (let off = 0; ; off += 1000) {
    const { data } = await sb.from('artist_fame').select('artist_id, fame').range(off, off + 999)
    if (!data?.length) break
    for (const r of data as any[]) fame.set(r.artist_id, r.fame)
    if (data.length < 1000) break
  }

  const nameById = new Map((terrs || []).map((t: any) => [t.id, t.name]))
  const near = new Map<string, { id: string; n: string }[]>()
  for (const e of (edges as any[]) || []) {
    const arr = near.get(e.a_id) || []
    if (arr.length < 5 && nameById.has(e.b_id)) {
      arr.push({ id: e.b_id, n: nameById.get(e.b_id)! })
      near.set(e.a_id, arr)
    }
  }

  v3Cache = {
    at: Date.now(),
    worlds: ((worlds as any[]) || []) as WorldRow[],
    terrs: ((terrs as any[]) || []) as TerrV3[],
    members, near, fame,
  }
  return v3Cache
}

export async function buildMap(viewer: GameViewer): Promise<{
  regions: MapRegion[]
  totals: { beacons: number; visited: number; heard: number; saved: number; substylesTouched: number; substylesTotal: number }
  likeCounts: { artists: number; albums: number; tracks: number }
}> {
  const sb = createAdminClient()
  const taxo = await loadTaxonomy()
  const likes = await fetchViewerLikes(viewer)

  // ── Viewer'io atlikėjai su būsenom ir substiliais ──
  type VA = { subs: Set<number>; beacon: boolean; visited: boolean; heard: boolean; saved: boolean }
  const va = new Map<number, VA>()
  const ensure = (id: number): VA => {
    let v = va.get(id)
    if (!v) { v = { subs: new Set(), beacon: false, visited: false, heard: false, saved: false }; va.set(id, v) }
    return v
  }

  // Švyturiai: artist/track like'ai + album like'ų atlikėjai
  const beaconArtists = new Set<number>([...likes.artistIds, ...likes.trackArtistIds])
  if (likes.albumIds.size) {
    for (const ids of chunk([...likes.albumIds].slice(0, 400), 200)) {
      const { data } = await sb.from('albums').select('artist_id').in('id', ids).limit(400)
      for (const r of (data as any[]) || []) if (r.artist_id) beaconArtists.add(r.artist_id)
    }
  }
  for (const id of beaconArtists) ensure(id).beacon = true
  for (const ids of chunk([...beaconArtists].slice(0, 600), 200)) {
    const { data } = await sb.from('artist_substyles').select('artist_id, substyle_id').in('artist_id', ids).limit(1000)
    for (const r of (data as any[]) || []) ensure(r.artist_id).subs.add(r.substyle_id)
  }

  // Gilyn kelionės (visited/heard/saved)
  const totals = { visited: 0, heard: 0, saved: 0 }
  if (viewer.userId || viewer.anonId) {
    let q = sb.from('gilyn_map_nodes').select('artist_id, visited, heard, saved, substyle_ids')
    q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
    const { data } = await q.limit(1000)
    for (const r of (data as any[]) || []) {
      const v = ensure(r.artist_id)
      if (r.visited) { v.visited = true; totals.visited++ }
      if (r.heard) { v.heard = true; totals.heard++ }
      if (r.saved) { v.saved = true; totals.saved++ }
      for (const s of r.substyle_ids || []) v.subs.add(s)
    }
  }

  // ── Vienetai: TERITORIJOS v3 (pasaulis → teritorija) ──
  const v3 = await loadV3()

  // Kiekvienos teritorijos „veidai" — žymiausi pagal AI žinomumą (ne pagal
  // like'us: kitaip klasikos teritorijos rodytų tuštumą).
  const faceIds = new Set<number>([...va.keys()].slice(0, 900))
  const facesByTerr = new Map<string, number[]>()
  for (const t of v3.terrs) {
    const mem = v3.members.get(t.id) || []
    const top = mem
      .map(m => ({ id: m.artistId, f: v3.fame.get(m.artistId) || 1 }))
      .sort((a, b) => b.f - a.f)
      .slice(0, 5)
      .map(x => x.id)
    facesByTerr.set(t.id, top)
    for (const id of top) faceIds.add(id)
  }

  const nameById = new Map<number, string>()
  const imgById = new Map<number, string | null>()
  for (const ids of chunk([...faceIds], 200)) {
    const { data } = await sb.from('artists').select('id, name, cover_image_url').in('id', ids).limit(400)
    for (const r of (data as any[]) || []) { nameById.set(r.id, r.name); imgById.set(r.id, r.cover_image_url || null) }
  }

  const eraLabel = (t: TerrV3) =>
    t.era_from && t.era_to ? `${t.era_from}–${t.era_to}` : t.era_from ? `${t.era_from}–` : t.era_to ? `iki ${t.era_to}` : null

  const regions: MapRegion[] = v3.worlds.map((w, wi) => {
    const cells: MapRegion['substyles'] = []
    for (const t of v3.terrs.filter(x => x.world_id === w.id)) {
      let beacons = 0, visited = 0, heard = 0, saved = 0
      const artists: { id: number; n: string; k: 'saved' | 'visited' | 'beacon'; img?: string | null }[] = []
      for (const m of v3.members.get(t.id) || []) {
        const v = va.get(m.artistId)
        if (!v) continue
        if (v.beacon) beacons++
        if (v.visited) visited++
        if (v.heard) heard++
        if (v.saved) saved++
        if (artists.length < 10) {
          const n = nameById.get(m.artistId)
          if (n) artists.push({ id: m.artistId, n, k: v.saved ? 'saved' : v.visited ? 'visited' : 'beacon', img: imgById.get(m.artistId) || null })
        }
      }
      artists.sort((a, b) => (a.k === 'saved' ? 0 : a.k === 'visited' ? 1 : 2) - (b.k === 'saved' ? 0 : b.k === 'visited' ? 1 : 2))
      const top = (facesByTerr.get(t.id) || [])
        .map(id => ({ id, n: nameById.get(id) || '', img: imgById.get(id) || null }))
        .filter(x => x.n)
      cells.push({
        id: t.id, name: t.name, size: t.n_artists,
        era: eraLabel(t), region: t.region, essence: t.essence,
        known: t.n_known, missing: t.n_missing,
        beacons, visited, heard, saved,
        artists: artists.slice(0, 8), top,
        near: v3.near.get(t.id) || [],
      })
    }
    cells.sort((a, b) => (b.size || 0) - (a.size || 0))
    return {
      genreId: wi, worldId: w.id, name: w.name, color: w.color || undefined,
      substyles: cells,
      beacons: cells.reduce((s, x) => s + (x.beacons ? 1 : 0), 0),
      visited: cells.reduce((s, x) => s + (x.visited ? 1 : 0), 0),
    }
  })

  const territoriesTotal = v3.terrs.length
  const territoriesTouched = regions.reduce((s, r) => s + r.substyles.filter(c => c.beacons || c.visited || c.saved).length, 0)

  return {
    regions,
    totals: {
      beacons: beaconArtists.size, visited: totals.visited, heard: totals.heard, saved: totals.saved,
      substylesTouched: territoriesTouched, substylesTotal: territoriesTotal,
    },
    likeCounts: likes.counts,
  }
}

/** Vartotojo kelionių briaunos žemėlapiui: substilius→substilius su durų tipu. */
export async function buildTravelEdges(viewer: GameViewer): Promise<{ a: number; b: number; t: string }[]> {
  if (!viewer.userId && !viewer.anonId) return []
  const sb = createAdminClient()
  let q = sb.from('gilyn_runs').select('path').in('status', ['dig', 'done'])
  q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
  const { data } = await q.order('day', { ascending: false }).limit(60)
  const runs = ((data as any[]) || []).map(r => (Array.isArray(r.path) ? r.path : [])).filter(p => p.length > 1)
  const artistIds = [...new Set(runs.flat().map((n: any) => n.artistId).filter(Boolean))] as number[]
  if (!artistIds.length) return []
  const meta = await fetchArtistMeta(artistIds)
  const subOf = (id: number) => (meta.get(id)?.substyleIds || [])[0] || null
  const edges = new Map<string, { a: number; b: number; t: string }>()
  for (const path of runs) {
    for (let i = 1; i < path.length; i++) {
      const a = subOf(path[i - 1].artistId), b = subOf(path[i].artistId)
      if (!a || !b || a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (!edges.has(key)) edges.set(key, { a, b, t: path[i].doorType || 'sound' })
    }
  }
  return [...edges.values()].slice(0, 120)
}

/** Žemėlapio mazgo upsert (visited/heard/saved flag'ai). */
export async function upsertMapNode(viewer: GameViewer, artistId: number, flags: { visited?: boolean; heard?: boolean; saved?: boolean }, via?: string): Promise<void> {
  if (!viewer.userId && !viewer.anonId) return
  const sb = createAdminClient()
  const meta = await fetchArtistMeta([artistId])
  const m = meta.get(artistId) || { genreIds: [], substyleIds: [] }
  let q = sb.from('gilyn_map_nodes').select('id, visited, heard, saved')
  q = viewer.userId ? q.eq('user_id', viewer.userId) : q.eq('anon_id', viewer.anonId!)
  const { data: ex } = await q.eq('artist_id', artistId).maybeSingle()
  if (ex) {
    await sb.from('gilyn_map_nodes').update({
      visited: ex.visited || !!flags.visited,
      heard: ex.heard || !!flags.heard,
      saved: ex.saved || !!flags.saved,
      updated_at: new Date().toISOString(),
    }).eq('id', ex.id)
  } else {
    await sb.from('gilyn_map_nodes').insert({
      user_id: viewer.userId, anon_id: viewer.userId ? null : viewer.anonId,
      artist_id: artistId,
      visited: !!flags.visited, heard: !!flags.heard, saved: !!flags.saved,
      via: via || null,
      substyle_ids: m.substyleIds, genre_ids: m.genreIds,
      first_day: todayLT(),
    })
  }
}

// ── BENDRUOMENĖS STATISTIKA ───────────────────────────────────────────────

export async function communityStats(day: string, myRun: any): Promise<{
  finished: number
  heldSameFinal: number       // % baigusių su tuo pačiu albumu
  avgSwaps: number
  doorSplit: { sound: number; scene: number; bridge: number }[] // per žingsnį, %
  sameFinalRegion: number     // % pasiekusių tą patį galutinį atlikėją
} | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('gilyn_runs')
    .select('held, path, swaps, status')
    .eq('day', day).eq('status', 'done')
    .limit(3000)
  const runs = ((data as any[]) || [])
  if (!runs.length) return null
  const finished = runs.length
  const myHeld = myRun?.held?.albumId
  const myFinal = Array.isArray(myRun?.path) && myRun.path.length ? myRun.path[myRun.path.length - 1]?.artistId : null
  let sameHeld = 0, sameFinal = 0, swapSum = 0
  const split: { sound: number; scene: number; bridge: number }[] = [
    { sound: 0, scene: 0, bridge: 0 }, { sound: 0, scene: 0, bridge: 0 }, { sound: 0, scene: 0, bridge: 0 },
  ]
  const stepTotals = [0, 0, 0]
  for (const r of runs) {
    swapSum += r.swaps || 0
    if (myHeld && r.held?.albumId === myHeld) sameHeld++
    const p = Array.isArray(r.path) ? r.path : []
    if (myFinal && p.length && p[p.length - 1]?.artistId === myFinal) sameFinal++
    p.forEach((n: any, i: number) => {
      if (i < 3 && n?.doorType && n.doorType !== 'portal' && split[i][n.doorType as 'sound'] !== undefined) {
        split[i][n.doorType as 'sound' | 'scene' | 'bridge']++
        stepTotals[i]++
      }
    })
  }
  return {
    finished,
    heldSameFinal: Math.round((sameHeld / finished) * 100),
    avgSwaps: Math.round((swapSum / finished) * 10) / 10,
    doorSplit: split.map((s, i) => {
      const t = Math.max(1, stepTotals[i])
      return { sound: Math.round((s.sound / t) * 100), scene: Math.round((s.scene / t) * 100), bridge: Math.round((s.bridge / t) * 100) }
    }),
    sameFinalRegion: Math.round((sameFinal / finished) * 100),
  }
}
