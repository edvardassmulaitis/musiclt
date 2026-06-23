// lib/music-import.ts
// ───────────────────────────────────────────────────────────────────────────
// Mėgstamos muzikos importas iš išorinių platformų į „Mano muziką".
//
// Šaltiniai (source adapters → raw items):
//   • Last.fm   — username (be OAuth, reikia LASTFM_API_KEY)
//   • Spotify   — „Download your data" YourLibrary.json (parse'inamas kliente)
//   • YouTube   — viešo playlisto nuoroda (YOUTUBE_API_KEY, be OAuth)
//
// Visi šaltiniai gamina vienodus RawItems, kurie per search-core.ts
// sumečiami (match) su music.lt baze → staged preview (matched/unmatched).
// Patvirtinus, commitInto() masiškai įdeda per profile_favorite_*.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { searchArtistsCore, searchTracksCore, searchAlbumsCore, normLt } from '@/lib/search-core'
import { addToLibrary, type FavKind } from '@/lib/mano-muzika'
import { parseSpotifyExport } from '@/lib/spotify-export'
import {
  normalizeForMatch, primaryArtist, resolveArtistIds,
  findConfidentMatch, findConfidentAlbumMatch, recallResolution,
} from '@/lib/chart-resolve'
import { ytThumb } from '@/lib/radaras-shared'

// ── Raw / staged tipai ─────────────────────────────────────────────────────
export type RawArtist = { name: string; meta?: any }
export type RawTrackish = { artist: string; title: string; meta?: any } // track arba album
export type RawItems = { artists?: RawArtist[]; tracks?: RawTrackish[]; albums?: RawTrackish[] }

export type StagedHit = {
  raw: string                 // originalas iš šaltinio (rodymui)
  rawArtist?: string
  matched: boolean
  confidence: 'high' | 'low'
  id?: number                 // music.lt entity id
  name?: string               // music.lt pavadinimas
  slug?: string
  cover?: string | null
  artist?: string | null      // dainoms/albumams
  artistSlug?: string | null  // open-in-new-tab nuorodai (albumams)
  pop?: number                // nario populiarumas šaltinyje (Last.fm playcount)
}
export type StagedResult = {
  artists: StagedHit[]
  tracks: StagedHit[]
  albums: StagedHit[]
  counts: { matched: number; unmatched: number; total: number }
}

// ── Util: concurrency-ribotas map (kad neperkrautume Supabase) ─────────────
async function mapLimit<T, R>(arr: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length)
  let i = 0
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) {
      const idx = i++
      out[idx] = await fn(arr[idx])
    }
  })
  await Promise.all(workers)
  return out
}

// ── Util: ar atitiktis „patikima" ──────────────────────────────────────────
function nameMatches(query: string, result: string): boolean {
  const a = normLt(query), b = normLt(result)
  if (!a || !b) return false
  return a === b || b.includes(a) || a.includes(b)
}

// ── MATCHER ────────────────────────────────────────────────────────────────
export async function matchItems(items: RawItems, opts: { perKindLimit?: number; concurrency?: number } = {}): Promise<StagedResult> {
  const sb = createAdminClient()
  const cap = opts.perKindLimit ?? 500
  const cc = opts.concurrency ?? 6   // foniniam importui mažinam, kad neapkrautume DB

  const artists = (items.artists || []).slice(0, cap)
  const tracks = (items.tracks || []).slice(0, cap)
  const albums = (items.albums || []).slice(0, cap)

  // ARTISTS — top-1 per searchArtistsCore
  const artistHits: StagedHit[] = await mapLimit(artists, cc, async (a) => {
    const pop = Number(a.meta?.playcount) || 0
    // ── ATPAŽINIMAS — ta pati centralizuota logika kaip dainoms/albumams ──
    // resolveArtistIds: name_norm atomai (pilnas vardas + primary + „The"-variantai
    //  + „&/feat/x/vs" segmentai) → tiksli lygybė + token ilike + gated fuzzy.
    //  Tai pataiso „Bob Marley & The Wailers", „P!nk" ir pan., kurių senasis
    //  trigram top-1 prametdavo. Senasis searchArtistsCore — low-confidence fallback.
    const resolveBest = async (ids: number[]) => {
      if (!ids.length) return null
      const { data } = await sb.from('artists')
        .select('id, name, slug, cover_image_url, score')
        .in('id', ids).order('score', { ascending: false }).limit(1)
      return (data && data[0]) || null
    }
    try {
      let ids = await resolveArtistIds(sb, a.name)
      // Lietuviškas jungtukas „ir" (resolveArtistIds jo neskaido) — „Aistė … ir SKYLĖ".
      if (!ids.length && / ir /i.test(a.name)) {
        for (const part of a.name.split(/ ir /i)) {
          const r = await resolveArtistIds(sb, part.trim()); if (r.length) ids = ids.concat(r)
        }
      }
      const top = await resolveBest(ids)
      if (top) return {
        raw: a.name, matched: true, confidence: 'high' as const,
        id: top.id, name: top.name, slug: top.slug, cover: top.cover_image_url ?? null, pop,
      }
    } catch { /* kris į trigram fallback */ }
    // Fallback — senasis trigram (low-confidence).
    const res = await searchArtistsCore(sb, a.name, { limit: 1, select: 'id, name, slug, cover_image_url, score' })
    const top = res[0]
    if (!top) return { raw: a.name, matched: false, confidence: 'low' as const, pop }
    return {
      raw: a.name, matched: true, confidence: nameMatches(a.name, top.name) ? 'high' : 'low',
      id: top.id, name: top.name, slug: top.slug, cover: top.cover_image_url ?? null, pop,
    }
  })

  // TRACKS — compound „artist title" → searchTracksCore → hydrate
  const trackHits = await matchTrackish(sb, tracks, 'track', cc)
  // ALBUMS
  const albumHits = await matchTrackish(sb, albums, 'album', cc)

  const all = [...artistHits, ...trackHits, ...albumHits]
  const matched = all.filter(h => h.matched).length
  return {
    artists: artistHits, tracks: trackHits, albums: albumHits,
    counts: { matched, unmatched: all.length - matched, total: all.length },
  }
}

async function matchTrackish(sb: any, items: RawTrackish[], kind: 'track' | 'album', cc = 6): Promise<StagedHit[]> {
  return mapLimit(items, cc, async (it) => {
    const raw = it.title
    const artist = it.artist
    const pop = Number(it.meta?.playcount) || 0

    // ── ATPAŽINIMAS — ta pati patikima logika kaip išorinių topų susiejime ──
    // (atlikėjo „atomai" per name_norm + fuzzy katalogo match + cleanTitle +
    //  atlikėjo↔pavadinimo swap + pastovi sujungimų atmintis). Senasis trigram
    //  `searchTracksCore` palaiktas kaip paskutinis low-confidence fallback'as.
    let id: number | null = null
    let strong = false

    // 1) Pastovi atmintis — ankstesni rankiniai/auto sujungimai (chart_resolution_memory).
    try {
      const rec = await recallResolution(sb, artist, raw, kind)
      if (rec) { id = kind === 'track' ? rec.trackId : rec.albumId; if (id) strong = true }
    } catch { /* atmintis — best effort */ }

    // 2) Patikimas match per chart-resolve (fuzzy: prefix/containment/swap/title-anchored).
    if (!id) {
      try {
        if (kind === 'track') {
          const m = await findConfidentMatch(sb, artist, raw, { fuzzy: true })
          if (m) { id = m.trackId; strong = true }
        } else {
          const m = await findConfidentAlbumMatch(sb, artist, raw, { fuzzy: true })
          if (m) { id = m.albumId; strong = true }
        }
      } catch { /* ignore — kris į fallback */ }
    }

    // 3) Fallback — senasis trigram search (kad neprarastume jau veikusių atitikčių).
    if (!id) {
      const q = `${artist} ${raw}`.trim()
      const ids = kind === 'track'
        ? await searchTracksCore(sb, q, { limit: 1 })
        : await searchAlbumsCore(sb, q, { limit: 1 })
      id = ids[0] ?? null
    }

    if (!id) return { raw, rawArtist: artist, matched: false, confidence: 'low' as const, pop }
    return hydrateTrackish(sb, kind, id, raw, artist, pop, strong)
  })
}

// ── Hydrate matched track/album + thumbnail fallback ────────────────────────
// cover: cover_url → YouTube thumbnail (iš video_url) → albumo viršelis. Daugumos
// dainų `cover_url` tuščias, bet jos turi `video_url` (muzikinis klipas) → iš ten
// gauname miniatiūrą, kad importo peržiūroje matytųsi paveikslėliai.
async function hydrateTrackish(
  sb: any, kind: 'track' | 'album', id: number,
  raw: string, rawArtist: string, pop: number, strong: boolean,
): Promise<StagedHit> {
  const table = kind === 'track' ? 'tracks' : 'albums'
  const coverCol = kind === 'track' ? 'cover_url' : 'cover_image_url'
  const sel = kind === 'track'
    ? 'id, slug, title, cover_url, video_url, artists:artist_id(name, slug)'
    : 'id, slug, title, cover_image_url, artists:artist_id(name, slug)'
  const { data } = await sb.from(table).select(sel).eq('id', id).maybeSingle()
  if (!data) return { raw, rawArtist, matched: false, confidence: 'low' as const, pop }
  const artistObj = Array.isArray(data.artists) ? data.artists[0] : data.artists

  let cover: string | null = data[coverCol] ?? null
  if (!cover && kind === 'track') cover = ytThumb(data.video_url ?? null)
  if (!cover) {
    // Paskutinis fallback: albumo, kuriam priklauso daina, viršelis.
    try {
      if (kind === 'track') {
        const { data: at } = await sb.from('album_tracks')
          .select('albums(cover_image_url)').eq('track_id', id).limit(1).maybeSingle()
        const alb = at?.albums ? (Array.isArray(at.albums) ? at.albums[0] : at.albums) : null
        cover = alb?.cover_image_url ?? null
      }
    } catch { /* ignore */ }
  }

  return {
    raw, rawArtist, matched: true,
    // Patikimas (atmintis/chart-resolve) → high. Fallback → tikrinam pavadinimą.
    confidence: strong || nameMatches(raw, data.title) ? 'high' : 'low',
    id: data.id, name: data.title, slug: data.slug, cover,
    artist: artistObj?.name ?? null, artistSlug: artistObj?.slug ?? null, pop,
  }
}

// ── COMMIT — masinis įdėjimas į „Mano muziką" + revert-batch registravimas ──
export async function commitInto(
  userId: string,
  sel: { artists?: number[]; albums?: number[]; tracks?: number[]; weights?: Record<string, number> },
) {
  const sb = createAdminClient()
  // Importo „partija" — kad būtų galima atšaukti vienu mygtuku.
  const { data: batch } = await sb.from('music_import_batches')
    .insert({ user_id: userId, source: 'import' }).select('id').single()
  const batchId: string | null = (batch as any)?.id ?? null

  const kinds: [FavKind, number[]][] = [
    ['artist', (sel.artists || []).filter(Number.isFinite)],
    ['album', (sel.albums || []).filter(Number.isFinite)],
    ['track', (sel.tracks || []).filter(Number.isFinite)],
  ]
  let totalNew = 0
  for (const [kind, ids] of kinds) {
    if (!ids.length) continue
    const w: Record<number, number> = {}
    if (sel.weights) for (const id of ids) { const v = sel.weights[`${kind}:${id}`]; if (v != null) w[id] = v }
    // kurie įrašai NAUJI (nario dar nebuvo) — tik juos registruojam revertui
    const { data: existing } = await sb.from('likes').select('entity_id').eq('user_id', userId).eq('entity_type', kind).in('entity_id', ids)
    const have = new Set<number>(((existing || []) as any[]).map(x => x.entity_id))
    const newIds = ids.filter(id => !have.has(id))
    await addToLibrary(userId, kind, ids, w)
    if (batchId && newIds.length) {
      for (let i = 0; i < newIds.length; i += 200) {
        await sb.from('music_import_added')
          .upsert(newIds.slice(i, i + 200).map(id => ({ batch_id: batchId, kind, entity_id: id })), { ignoreDuplicates: true })
      }
      totalNew += newIds.length
    }
  }
  if (batchId) await sb.from('music_import_batches').update({ added: totalNew }).eq('id', batchId)
  return { ok: true, batchId, added: { artists: sel.artists?.length || 0, albums: sel.albums?.length || 0, tracks: sel.tracks?.length || 0 }, newAdded: totalNew }
}

// ── REVERT — atšaukti importo partiją (pašalinti tik tai, ką ji ĮDĖJO) ──────
export async function revertImportBatch(userId: string, opts: { batchId?: string; jobId?: string }): Promise<{ ok: boolean; removed: number; error?: string }> {
  const sb = createAdminClient()
  let q = sb.from('music_import_batches').select('*')
  if (opts.batchId) q = q.eq('id', opts.batchId)
  else if (opts.jobId) q = q.eq('job_id', opts.jobId)
  else return { ok: false, removed: 0, error: 'batchId arba jobId privalomas' }
  const { data: batch } = await q.maybeSingle()
  if (!batch) return { ok: false, removed: 0, error: 'Importas nerastas' }
  if ((batch as any).user_id !== userId) return { ok: false, removed: 0, error: 'Ne tavo importas' }
  if ((batch as any).status === 'reverted') return { ok: true, removed: 0 }

  // Jei susietas foninis job'as ir dar vyksta — sustabdom, kad nedėtų daugiau.
  if ((batch as any).job_id) {
    await sb.from('music_import_jobs').update({ status: 'canceled', locked_at: null }).eq('id', (batch as any).job_id).in('status', ['queued', 'running'])
  }

  // Vienas serverinis DELETE (RPC) — atsparu statement_timeout'ui ant didelės
  // likes lentelės (anksčiau chunked JS deletes likdavo nepilni).
  const { data: removedCount, error: rpcErr } = await sb.rpc('revert_import_batch', {
    p_batch_id: (batch as any).id, p_user_id: userId,
  })
  if (rpcErr) return { ok: false, removed: 0, error: rpcErr.message }
  await sb.from('music_import_batches').update({ status: 'reverted', reverted_at: new Date().toISOString() }).eq('id', (batch as any).id)
  return { ok: true, removed: Number(removedCount) || 0 }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE ADAPTERS
// ═══════════════════════════════════════════════════════════════════════════

// ── Last.fm ────────────────────────────────────────────────────────────────
export function lastfmConfigured(): boolean { return !!process.env.LASTFM_API_KEY }

export type ImportMode = 'best' | 'full'

// Kiek maksimaliai imti kiekvieno tipo. „best" = mėgstamiausi/dažniausi (švarus
// signalas), „full" = papildomai naujausia klausymų istorija (recent tracks).
// „best" turi būti GREITAS ir patikimas (sinchroninis — telpa į 60s funkcijos
// limitą). Gilus importas vyksta fone (žr. lib/import-jobs.ts), tad čia laikom
// kuklius limitus, kad atpažinimas spėtų užbaigti per vieną užklausą.
const LASTFM_CAPS: Record<ImportMode, { artists: number; albums: number; loved: number; top: number; recent: number }> = {
  best: { artists: 120, albums: 100, loved: 150, top: 120, recent: 0 },
  full: { artists: 500, albums: 400, loved: 1000, top: 500, recent: 1500 },
}

export async function fetchLastfm(username: string, opts: { mode?: ImportMode } = {}): Promise<RawItems> {
  const key = process.env.LASTFM_API_KEY
  if (!key) throw new Error('Last.fm importas nesukonfigūruotas (trūksta LASTFM_API_KEY)')
  const user = username.trim().replace(/^@/, '')
  if (!user) throw new Error('Įvesk Last.fm vartotojo vardą')
  const mode: ImportMode = opts.mode === 'full' ? 'full' : 'best'
  const CAP = LASTFM_CAPS[mode]
  const base = 'https://ws.audioscrobbler.com/2.0/'

  const call = async (method: string, extra: string) => {
    const url = `${base}?method=${method}&user=${encodeURIComponent(user)}&api_key=${key}&format=json&${extra}`
    const r = await fetch(url, { headers: { 'User-Agent': 'music.lt-import/1.0' } })
    if (!r.ok) {
      if (r.status === 404) throw new Error('Last.fm vartotojas nerastas')
      throw new Error(`Last.fm klaida (${r.status})`)
    }
    const json = await r.json().catch(() => null)
    // SVARBU: Last.fm dažnai grąžina HTTP 200 su klaidos kūnu ({error, message}) —
    // pvz. netinkamas API raktas (10), privatus/nerastas vartotojas (6), limitas (29).
    // Be šito patikrinimo klaida „pradingsta" ir importas tyliai grąžina 0 įrašų.
    if (json && typeof json === 'object' && 'error' in json) {
      const code = Number((json as any).error)
      if (code === 6 || code === 7) throw new Error('Last.fm vartotojas nerastas arba profilis privatus')
      if (code === 10 || code === 26) throw new Error('Last.fm importas nesukonfigūruotas (netinkamas API raktas)')
      if (code === 29) throw new Error('Last.fm laikinai apribojo užklausas — pabandyk po kelių minučių')
      throw new Error(`Last.fm klaida: ${(json as any).message || code}`)
    }
    return json
  }

  // Paginuotas rinkėjas — eina per puslapius kol surenka iki `cap` arba baigiasi.
  const paged = async (method: string, root: string, listKey: string, cap: number, extra = '', perPage = 200): Promise<any[]> => {
    if (cap <= 0) return []
    const out: any[] = []
    const maxPages = Math.ceil(cap / perPage) + 1
    for (let page = 1; out.length < cap && page <= maxPages; page++) {
      const data = await call(method, `limit=${perPage}&page=${page}${extra ? `&${extra}` : ''}`).catch(() => null)
      const container = data?.[root]
      const items = container?.[listKey]
      const arr = Array.isArray(items) ? items : (items ? [items] : [])
      if (!arr.length) break
      out.push(...arr)
      const totalPages = Number(container?.['@attr']?.totalPages || 0)
      if (totalPages && page >= totalPages) break
    }
    return out.slice(0, cap)
  }

  // Validacija PIRMIAUSIA — patikrinam API raktą ir ar vartotojas pasiekiamas.
  // Jei kažkas blogai, mesim aiškią klaidą (vietoj tylaus 0 rezultatų).
  await call('user.getinfo', '')

  const [topArt, topAlb, lovedT, topT] = await Promise.all([
    paged('user.gettopartists', 'topartists', 'artist', CAP.artists, 'period=overall'),
    paged('user.gettopalbums', 'topalbums', 'album', CAP.albums, 'period=overall'),
    paged('user.getlovedtracks', 'lovedtracks', 'track', CAP.loved),
    paged('user.gettoptracks', 'toptracks', 'track', CAP.top, 'period=overall'),
  ])

  const artists: RawArtist[] = topArt
    .map((a: any) => ({ name: a.name, meta: { playcount: Number(a.playcount) || 0 } }))
    .filter((a: RawArtist) => a.name)

  const albumMap = new Map<string, RawTrackish>()
  for (const a of topAlb) {
    const artist = a.artist?.name || a.artist?.['#text'] || ''
    if (a.name && artist) albumMap.set(`${artist}|${a.name}`.toLowerCase(), { artist, title: a.name, meta: { playcount: Number(a.playcount) || 0 } })
  }

  const trackMap = new Map<string, RawTrackish>()
  for (const t of lovedT) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    if (t.name && artist) trackMap.set(`${artist}|${t.name}`.toLowerCase(), { artist, title: t.name, meta: { loved: true } })
  }
  for (const t of topT) {
    const artist = t.artist?.name || t.artist?.['#text'] || ''
    const k = `${artist}|${t.name}`.toLowerCase()
    if (t.name && artist && !trackMap.has(k)) trackMap.set(k, { artist, title: t.name, meta: { playcount: Number(t.playcount) || 0 } })
  }

  // FULL — pridedam naujausią klausymų istoriją (recent tracks), dedup pagal raktą.
  if (CAP.recent > 0) {
    const recent = await paged('user.getrecenttracks', 'recenttracks', 'track', CAP.recent)
    for (const t of recent) {
      if (t['@attr']?.nowplaying) continue
      const artist = t.artist?.name || t.artist?.['#text'] || ''
      if (!t.name || !artist) continue
      const k = `${artist}|${t.name}`.toLowerCase()
      if (!trackMap.has(k)) trackMap.set(k, { artist, title: t.name, meta: { recent: true } })
      const alb = t.album?.['#text'] || t.album?.name || ''
      if (alb) {
        const ak = `${artist}|${alb}`.toLowerCase()
        if (!albumMap.has(ak)) albumMap.set(ak, { artist, title: alb, meta: { recent: true } })
      }
    }
  }

  return { artists, tracks: [...trackMap.values()], albums: [...albumMap.values()] }
}

// ── NEATPAŽINTŲ auto-reportas → „trūkstama muzika" (music_requests) ──────────
// Importo metu neatpažintus įrašus sudedam į bendrą trūkstamos muzikos eilę su
// source='import' ir prisegam narį prie kiekvieno requesto per
// music_request_followers. Kai adminas requestą išspręs (sukurs/susies entity),
// jis automatiškai bus pridėtas į šito nario „Mano muziką" (žr. admin route).
const importNormKey = (artist: string, title: string | null) =>
  `${normalizeForMatch(primaryArtist(artist || ''))}|${normalizeForMatch(title || '')}`

export async function reportMissingImport(
  userId: string,
  staged: StagedResult,
  source = 'import',
): Promise<{ reported: number }> {
  const sb = createAdminClient()
  type Pending = { raw_artist: string; raw_title: string | null; kind_hint: FavKind; norm_key: string }
  const pend: Pending[] = []
  const collect = (hits: StagedHit[], kind: FavKind) => {
    for (const h of hits) {
      if (h.matched) continue
      const artist = (h.rawArtist || (kind === 'artist' ? h.raw : '') || '').trim()
      const title = kind === 'artist' ? null : (h.raw || '').trim()
      if (!artist) continue
      pend.push({ raw_artist: artist, raw_title: title, kind_hint: kind, norm_key: importNormKey(artist, title) })
    }
  }
  collect(staged.artists, 'artist')
  collect(staged.albums, 'album')
  collect(staged.tracks, 'track')
  if (!pend.length) return { reported: 0 }

  // dedup per batch
  const seen = new Set<string>()
  const uniq = pend.filter(p => { if (seen.has(p.norm_key)) return false; seen.add(p.norm_key); return true })
  const keys = uniq.map(u => u.norm_key)

  // jau esami requestai pagal norm_key (bet kokio statuso) — nedubliuojam
  const existing = new Map<string, { id: string; status: string; matched_type: string | null; matched_id: number | null }>()
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await sb.from('music_requests')
      .select('id, norm_key, status, matched_type, matched_id')
      .in('norm_key', keys.slice(i, i + 200))
    for (const r of (data || []) as any[]) if (!existing.has(r.norm_key)) existing.set(r.norm_key, r)
  }

  // naujus įterpiam
  const toInsert = uniq.filter(u => !existing.has(u.norm_key)).map(u => ({
    source, raw_artist: u.raw_artist, raw_title: u.raw_title, kind_hint: u.kind_hint,
    context: 'Importas (Last.fm)', norm_key: u.norm_key, status: 'pending',
  }))
  const newIds: string[] = []
  for (let i = 0; i < toInsert.length; i += 200) {
    const { data } = await sb.from('music_requests').insert(toInsert.slice(i, i + 200)).select('id')
    for (const r of (data || []) as any[]) newIds.push(r.id)
  }

  // followerį prisegam: prie naujų + prie esamų
  const followerRows = newIds.map(id => ({ request_id: id, user_id: userId }))
  for (const r of existing.values()) followerRows.push({ request_id: r.id, user_id: userId })
  for (let i = 0; i < followerRows.length; i += 200) {
    await sb.from('music_request_followers')
      .upsert(followerRows.slice(i, i + 200), { onConflict: 'request_id,user_id', ignoreDuplicates: true })
  }

  // jei esamas requestas JAU išspręstas — entity pridedam į biblioteką iškart
  for (const r of existing.values()) {
    if (r.status === 'resolved' && r.matched_id && ['artist', 'album', 'track'].includes(r.matched_type || '')) {
      try { await addToLibrary(userId, r.matched_type as FavKind, [r.matched_id]) } catch {}
    }
  }
  return { reported: uniq.length }
}

// Suderinta pora: match + auto-report neatpažintų (jei userId yra).
export async function stageAndReport(
  userId: string | null,
  raw: RawItems,
  opts: { source?: string; perKindLimit?: number } = {},
): Promise<StagedResult & { reported: number }> {
  const staged = await matchItems(raw, opts.perKindLimit ? { perKindLimit: opts.perKindLimit } : {})
  let reported = 0
  if (userId) {
    try { reported = (await reportMissingImport(userId, staged, opts.source || 'import')).reported } catch {}
  }
  return { ...staged, reported }
}

// ── Spotify „Download your data" (bet kuris eksporto failas) ────────────────
// Parse'inama kliente (lib/spotify-export.ts); čia – tas pats normalizatorius
// server-side. Atpažįsta YourLibrary / Playlist / StreamingHistory /
// YourSoundCapsule / Follow; Wrapped (tik URI) grąžina tuščią.
export function parseSpotifyLibrary(json: any): RawItems {
  const p = parseSpotifyExport(json)
  return { artists: p.artists, tracks: p.tracks, albums: p.albums }
}

// ── YouTube viešas playlistas ──────────────────────────────────────────────
export function extractYoutubePlaylistId(input: string): string | null {
  const s = input.trim()
  const m = s.match(/[?&]list=([A-Za-z0-9_-]+)/)
  if (m) return m[1]
  if (/^[A-Za-z0-9_-]{12,}$/.test(s)) return s   // gali būti tiesiog ID
  return null
}

// Išvalo YouTube video pavadinimą iki „Artist - Title".
export function parseYoutubeTitle(title: string, channel?: string): RawTrackish | null {
  let t = (title || '')
    .replace(/\([^)]*\)/g, ' ')                  // (Official Video) ...
    .replace(/\[[^\]]*\]/g, ' ')                 // [Lyrics] ...
    .replace(/\b(official|video|audio|lyric[s]?|hd|hq|mv|m\/v|visualizer|live|remaster(ed)?)\b/gi, ' ')
    .replace(/[|｜].*/, ' ')                       // viskas po | atmesti
    .replace(/\s+/g, ' ').trim()
  // „Artist - Title"
  const dash = t.split(/\s[-–—]\s/)
  if (dash.length >= 2) {
    const artist = dash[0].trim()
    const titleP = dash.slice(1).join(' - ').trim()
    if (artist && titleP) return { artist, title: titleP }
  }
  // Be brūkšnio — naudoti kanalą kaip atlikėją (nuimam „- Topic")
  const ch = (channel || '').replace(/\s*-\s*Topic$/i, '').trim()
  if (ch && t) return { artist: ch, title: t }
  return null
}

export async function fetchYoutubePlaylist(url: string): Promise<RawItems> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YouTube importas nesukonfigūruotas (trūksta YOUTUBE_API_KEY)')
  const playlistId = extractYoutubePlaylistId(url)
  if (!playlistId) throw new Error('Nepavyko atpažinti playlisto nuorodos (turi būti ?list=...)')

  const tracks: RawTrackish[] = []
  let pageToken = ''
  for (let page = 0; page < 2; page++) {   // iki ~100 įrašų
    const api = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const r = await fetch(api)
    if (!r.ok) {
      if (r.status === 404) throw new Error('Playlistas nerastas arba privatus')
      throw new Error(`YouTube klaida (${r.status})`)
    }
    const data = await r.json()
    for (const it of (data.items || [])) {
      const sn = it.snippet || {}
      if (sn.title === 'Private video' || sn.title === 'Deleted video') continue
      const parsed = parseYoutubeTitle(sn.title, sn.videoOwnerChannelTitle)
      if (parsed) tracks.push(parsed)
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return { tracks }
}
