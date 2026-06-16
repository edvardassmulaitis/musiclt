// lib/import-jobs.ts
// ───────────────────────────────────────────────────────────────────────────
// Fone vykdomas „power user" muzikos importas (deep Last.fm biblioteka).
//
// Modelis (atsparus Vercel 60s limitui — resumable batch'ai per cron):
//   enqueueImportJob() → music_import_jobs (status=queued, phase=fetch)
//   cron /api/cron/import-jobs kviečia processJobs() kas minutę:
//     phase=fetch  — paginuotai traukia Last.fm srautus į music_import_job_items
//                    (dedup pagal norm), kol surenka visus → phase=match
//     phase=match  — batch'ais (MATCH_BATCH) atpažįsta įrašus:
//                      • atpažinti  → addToLibrary (iškart į „Mano muziką")
//                      • neatpažinti → reportMissingImport (music_requests +
//                        followerių ryšys; sutvarkius admine atsiras vėliau)
//                    kai nebelieka pending → phase=done + system pranešimas.
// ───────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'
import { matchItems, reportMissingImport, type RawItems, type StagedResult, type StagedHit } from '@/lib/music-import'
import { addToLibrary, type FavKind } from '@/lib/mano-muzika'
import { createNotification } from '@/lib/notifications'

type Kind = 'artist' | 'album' | 'track'
type Stream = { kind: Kind; method: string; root: string; listKey: string; extra: string; cap: number }

// Deep importo srautai (background — laikas ne UX problema, imam plačiai).
const FULL_STREAMS: Stream[] = [
  { kind: 'artist', method: 'user.gettopartists',   root: 'topartists',   listKey: 'artist', extra: 'period=overall', cap: 1000 },
  { kind: 'album',  method: 'user.gettopalbums',    root: 'topalbums',    listKey: 'album',  extra: 'period=overall', cap: 1000 },
  { kind: 'track',  method: 'user.getlovedtracks',  root: 'lovedtracks',  listKey: 'track',  extra: '',               cap: 2000 },
  { kind: 'track',  method: 'user.gettoptracks',    root: 'toptracks',    listKey: 'track',  extra: 'period=overall', cap: 1000 },
  { kind: 'track',  method: 'user.getrecenttracks', root: 'recenttracks', listKey: 'track',  extra: '',               cap: 5000 },
]
const PER_PAGE = 200
// THROTTLE: laikom DB apkrovą žemą (importas neturi trukdyti svetainei).
const FETCH_PAGES_PER_TICK = 8    // kiek Last.fm puslapių vienam fetch žingsniui
const MATCH_BATCH = 60            // kiek įrašų atpažįstame per batch'ą
const MATCH_CONCURRENCY = 3       // DB paieškų lygiagretumas (buvo 6)
const MAX_BATCHES_PER_TICK = 3    // daugiausia batch'ų per cron tick'ą (~180 įrašų/min)
const BATCH_PAUSE_MS = 500        // pauzė tarp batch'ų — atokvėpis DB
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function normKey(kind: string, artist: string, title: string | null): string {
  return `${kind}|${(artist || '').toLowerCase().trim()}|${(title || '').toLowerCase().trim()}`
}

async function lastfmCall(method: string, user: string, extra: string): Promise<any> {
  const key = process.env.LASTFM_API_KEY
  if (!key) throw new Error('Last.fm importas nesukonfigūruotas (trūksta LASTFM_API_KEY)')
  const url = `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${encodeURIComponent(user)}&api_key=${key}&format=json&${extra}`
  const r = await fetch(url, { headers: { 'User-Agent': 'music.lt-import/1.0' } })
  if (!r.ok) {
    if (r.status === 404) throw new Error('Last.fm vartotojas nerastas')
    throw new Error(`Last.fm klaida (${r.status})`)
  }
  const json = await r.json().catch(() => null)
  if (json && typeof json === 'object' && 'error' in json) {
    const code = Number((json as any).error)
    if (code === 6 || code === 7) throw new Error('Last.fm vartotojas nerastas arba profilis privatus')
    if (code === 10 || code === 26) throw new Error('Last.fm netinkamas API raktas')
    if (code === 29) throw new Error('Last.fm užklausų limitas — vėliau')
    throw new Error(`Last.fm klaida: ${(json as any).message || code}`)
  }
  return json
}

function toItem(kind: Kind, it: any): { kind: Kind; artist: string; title: string | null; pop: number } | null {
  const pop = Number(it?.playcount) || 0
  if (kind === 'artist') return it?.name ? { kind, artist: it.name, title: null, pop } : null
  if (it?.['@attr']?.nowplaying) return null
  const artist = it?.artist?.name || it?.artist?.['#text'] || ''
  const title = it?.name || ''
  return artist && title ? { kind, artist, title, pop } : null
}

// ── Greitas „skenavimas" — kiek ko yra Last.fm (kad naudotojas pasirinktų apimtį)
export async function scanLastfm(username: string): Promise<{ artists: number; albums: number; lovedTracks: number; topTracks: number; recentTracks: number }> {
  const user = username.trim().replace(/^@/, '')
  if (!user) throw new Error('Įvesk Last.fm vartotojo vardą')
  const total = async (method: string, root: string) => {
    const d = await lastfmCall(method, user, 'limit=1&page=1').catch(() => null)
    return Number(d?.[root]?.['@attr']?.total || 0)
  }
  const [artists, albums, lovedTracks, topTracks, recentTracks] = await Promise.all([
    total('user.gettopartists', 'topartists'),
    total('user.gettopalbums', 'topalbums'),
    total('user.getlovedtracks', 'lovedtracks'),
    total('user.gettoptracks', 'toptracks'),
    total('user.getrecenttracks', 'recenttracks'),
  ])
  return { artists, albums, lovedTracks, topTracks, recentTracks }
}

// Apimties parinktys (iš job.params.scope).
type Scope = { kinds: Kind[]; historyMode: 'best' | 'all'; minPlaycount: number }
function getScope(job: any): Scope {
  const s = job?.params?.scope || {}
  const kinds: Kind[] = Array.isArray(s.kinds) && s.kinds.length ? s.kinds : ['artist', 'album', 'track']
  return { kinds, historyMode: s.historyMode === 'all' ? 'all' : 'best', minPlaycount: Number(s.minPlaycount) || 0 }
}

// ── Enqueue / status ───────────────────────────────────────────────────────
export async function enqueueImportJob(userId: string, source: string, params: any): Promise<{ id: string; existing: boolean }> {
  const sb = createAdminClient()
  // Vienam useriui — vienas aktyvus job (neleidžiam dublikatų).
  const { data: active } = await sb.from('music_import_jobs')
    .select('id').eq('user_id', userId).in('status', ['queued', 'running']).limit(1).maybeSingle()
  if (active) return { id: (active as any).id, existing: true }
  const { data, error } = await sb.from('music_import_jobs')
    .insert({ user_id: userId, source, params, status: 'queued', phase: 'fetch' }).select('id').single()
  if (error) throw error
  const jobId = (data as any).id
  // Revert-partija šitam job'ui (kad būtų galima atšaukti foninį importą).
  try { await sb.from('music_import_batches').insert({ user_id: userId, source, job_id: jobId }) } catch {}
  return { id: jobId, existing: false }
}

export async function getLatestJob(userId: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('music_import_jobs')
    .select('id, status, phase, total, processed, matched, reported, error, created_at, finished_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  // Pridedam revert-partijos būseną (kad UI rodytų „Atšaukti importą").
  const { data: batch } = await sb.from('music_import_batches')
    .select('id, status').eq('job_id', (data as any).id).maybeSingle()
  return { ...(data as any), batch_id: (batch as any)?.id ?? null, batch_status: (batch as any)?.status ?? null }
}

// ── Worker ───────────────────────────────────────────────────────────────--
async function claimJob(sb: any): Promise<any | null> {
  const { data: cands } = await sb.from('music_import_jobs')
    .select('*').in('status', ['queued', 'running']).order('created_at', { ascending: true }).limit(5)
  const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString()
  for (const j of (cands || []) as any[]) {
    // praleidžiam jei kitas tick'as neseniai užrakino
    if (j.status === 'running' && j.locked_at && j.locked_at > stale) continue
    const { data: upd } = await sb.from('music_import_jobs')
      .update({ status: 'running', locked_at: new Date().toISOString(), started_at: j.started_at || new Date().toISOString() })
      .eq('id', j.id).eq('status', j.status).select('*').maybeSingle()
    if (upd) return upd
  }
  return null
}

export async function processJobs(budgetMs = 45000): Promise<{ ok: boolean; idle?: boolean; jobId?: string; error?: string }> {
  const sb = createAdminClient()
  const job = await claimJob(sb)
  if (!job) return { ok: true, idle: true }
  const t0 = Date.now()
  try {
    let cur: any = job
    let matchBatches = 0
    while (Date.now() - t0 < budgetMs) {
      if (cur.phase === 'fetch') {
        await fetchTick(sb, cur)
      } else if (cur.phase === 'match') {
        const more = await matchTick(sb, cur)
        if (!more) break
        // THROTTLE: ribojam batch'ų skaičių + pauzė, kad neapkrautume DB.
        if (++matchBatches >= MAX_BATCHES_PER_TICK) break
        await sleep(BATCH_PAUSE_MS)
      } else break
      const { data: fresh } = await sb.from('music_import_jobs').select('*').eq('id', job.id).maybeSingle()
      if (!fresh) break
      cur = fresh
      if (cur.status !== 'running') break   // done / canceled (revert) / error
    }
    const { data: f } = await sb.from('music_import_jobs').select('status').eq('id', job.id).maybeSingle()
    if (f && (f as any).status !== 'done') await sb.from('music_import_jobs').update({ locked_at: null }).eq('id', job.id)
    return { ok: true, jobId: job.id }
  } catch (e: any) {
    await sb.from('music_import_jobs').update({ status: 'error', error: String(e?.message || e).slice(0, 500), locked_at: null }).eq('id', job.id)
    return { ok: false, jobId: job.id, error: String(e?.message || e) }
  }
}

// Pagal apimtį — kuriuos srautus traukti.
function activeStreams(scope: Scope): Stream[] {
  return FULL_STREAMS.filter(st =>
    scope.kinds.includes(st.kind) &&
    (scope.historyMode === 'all' || st.method !== 'user.getrecenttracks'))
}

async function fetchTick(sb: any, job: any): Promise<void> {
  const user = String(job.params?.username || '').trim().replace(/^@/, '')
  if (!user) throw new Error('Job be Last.fm username')
  const scope = getScope(job)
  const streams = activeStreams(scope)
  const cursor = job.fetch_cursor || {}
  let si = cursor.si ?? 0
  let page = cursor.page ?? 1
  let got = cursor.got ?? 0
  let pages = 0
  const rows: any[] = []

  // Pirmo tick'o pradžioje — validuojam raktą/vartotoją (klaida → job 'error').
  if (si === 0 && page === 1 && got === 0) await lastfmCall('user.getinfo', user, '')

  while (si < streams.length && pages < FETCH_PAGES_PER_TICK) {
    const st = streams[si]
    const data = await lastfmCall(st.method, user, `limit=${PER_PAGE}&page=${page}&${st.extra}`).catch(() => null)
    pages++
    const container = data?.[st.root]
    const items = container?.[st.listKey]
    const arr = Array.isArray(items) ? items : (items ? [items] : [])
    for (const it of arr) {
      if (got >= st.cap) break
      const rec = toItem(st.kind, it)
      if (!rec) continue
      // minimalaus klausymų skaičiaus slenkstis (tik įrašams su playcount)
      if (scope.minPlaycount > 0 && rec.pop > 0 && rec.pop < scope.minPlaycount) continue
      rows.push(rec)
      got++
    }
    const totalPages = Number(container?.['@attr']?.totalPages || 0)
    const noMore = !arr.length || got >= st.cap || (totalPages && page >= totalPages)
    if (noMore) { si++; page = 1; got = 0 } else { page++ }
  }

  if (rows.length) {
    for (let i = 0; i < rows.length; i += 200) {
      await sb.from('music_import_job_items').upsert(
        rows.slice(i, i + 200).map(r => ({
          job_id: job.id, kind: r.kind, raw_artist: r.artist, raw_title: r.title, pop: r.pop || 0, norm: normKey(r.kind, r.artist, r.title),
        })),
        { onConflict: 'job_id,norm', ignoreDuplicates: true },
      )
    }
  }

  if (si >= streams.length) {
    const { count } = await sb.from('music_import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', job.id)
    await sb.from('music_import_jobs').update({ phase: 'match', total: count || 0, fetch_cursor: { si, page, got } }).eq('id', job.id)
  } else {
    await sb.from('music_import_jobs').update({ fetch_cursor: { si, page, got } }).eq('id', job.id)
  }
}

async function matchTick(sb: any, job: any): Promise<boolean> {
  const { data: items } = await sb.from('music_import_job_items')
    .select('id, kind, raw_artist, raw_title, pop').eq('job_id', job.id).eq('status', 'pending').limit(MATCH_BATCH)
  if (!items || !items.length) { await finishJob(sb, job); return false }

  const raw: RawItems = { artists: [], tracks: [], albums: [] }
  for (const it of items as any[]) {
    if (it.kind === 'artist') raw.artists!.push({ name: it.raw_artist })
    else if (it.kind === 'album') raw.albums!.push({ artist: it.raw_artist, title: it.raw_title })
    else raw.tracks!.push({ artist: it.raw_artist, title: it.raw_title })
  }

  const staged = await matchItems(raw, { perKindLimit: MATCH_BATCH, concurrency: MATCH_CONCURRENCY })
  // Sukuriam raw→matchId žemėlapį pagal eilę (matchItems grąžina ta pačia tvarka).
  const mapByKind: Record<string, Map<string, number>> = { artist: new Map(), album: new Map(), track: new Map() }
  for (const h of staged.artists) if (h.matched && h.id) mapByKind.artist.set((h.raw || '').toLowerCase(), h.id)
  for (const h of staged.albums) if (h.matched && h.id) mapByKind.album.set(`${(h.rawArtist || '').toLowerCase()}|${(h.raw || '').toLowerCase()}`, h.id)
  for (const h of staged.tracks) if (h.matched && h.id) mapByKind.track.set(`${(h.rawArtist || '').toLowerCase()}|${(h.raw || '').toLowerCase()}`, h.id)

  // Saugom rezultatus į job_items (NEpridedam į biblioteką — laukiam patvirtinimo).
  let matchedCount = 0
  for (const it of items as any[]) {
    const k = it.kind === 'artist' ? (it.raw_artist || '').toLowerCase() : `${(it.raw_artist || '').toLowerCase()}|${(it.raw_title || '').toLowerCase()}`
    const mid = mapByKind[it.kind]?.get(k) ?? null
    if (mid) matchedCount++
    await sb.from('music_import_job_items').update({ status: 'processed', matched_type: mid ? it.kind : null, matched_id: mid }).eq('id', it.id)
  }
  await sb.from('music_import_jobs').update({
    processed: (job.processed || 0) + items.length,
    matched: (job.matched || 0) + matchedCount,
  }).eq('id', job.id)
  return true
}

async function finishJob(sb: any, job: any): Promise<void> {
  // Importas paruoštas PERŽIŪRAI (nieko dar nepridėta į biblioteką).
  const { data: fresh } = await sb.from('music_import_jobs')
    .select('matched, processed, notified, user_id').eq('id', job.id).maybeSingle()
  const f: any = fresh || job
  await sb.from('music_import_jobs')
    .update({ status: 'ready', phase: 'done', finished_at: new Date().toISOString(), locked_at: null }).eq('id', job.id)
  if (f.notified) return
  await sb.from('music_import_jobs').update({ notified: true }).eq('id', job.id)
  try {
    const { data: prof } = await sb.from('profiles').select('email').eq('id', f.user_id).maybeSingle()
    const matched = f.matched || 0
    await createNotification({
      user_id: f.user_id,
      recipient_email: (prof as any)?.email || null,
      type: 'system',
      title: 'Importas paruoštas peržiūrai',
      snippet: `Radome ${matched} atitikčių iš tavo Last.fm — peržiūrėk ir patvirtink, ką pridėti į savo muziką.`,
      url: '/mano-muzika/importas',
      data: { kind: 'music_import_review', matched },
    })
  } catch {}
}

// ── PERŽIŪRA — paruošto (status='ready') job'o atitiktys, hidratuotos UI'ui ──
export type ReviewHit = { itemId: number; id: number; name: string; slug: string | null; cover: string | null; artist: string | null; artistSlug: string | null; pop: number }
export async function getReviewItems(userId: string, jobId: string): Promise<{ status: string; matched: number; missing: number; items: { artists: ReviewHit[]; albums: ReviewHit[]; tracks: ReviewHit[] } } | null> {
  const sb = createAdminClient()
  const { data: job } = await sb.from('music_import_jobs').select('id, user_id, status, matched, processed').eq('id', jobId).maybeSingle()
  if (!job || (job as any).user_id !== userId) return null
  const { data: rows } = await sb.from('music_import_job_items')
    .select('id, kind, matched_id, pop').eq('job_id', jobId).not('matched_id', 'is', null).limit(6000)
  const r = (rows || []) as any[]
  const idsByKind: Record<string, number[]> = { artist: [], album: [], track: [] }
  for (const x of r) idsByKind[x.kind]?.push(x.matched_id)
  const artMap = new Map<number, any>(), albMap = new Map<number, any>(), trkMap = new Map<number, any>()
  const chunk = (a: number[]) => { const out: number[][] = []; for (let i = 0; i < a.length; i += 300) out.push(a.slice(i, i + 300)); return out }
  for (const c of chunk(idsByKind.artist)) { const { data } = await sb.from('artists').select('id, name, slug, cover_image_url').in('id', c); for (const a of data || []) artMap.set(a.id, a) }
  for (const c of chunk(idsByKind.album)) { const { data } = await sb.from('albums').select('id, title, slug, cover_image_url, artists:artist_id(name, slug)').in('id', c); for (const a of data || []) albMap.set(a.id, a) }
  for (const c of chunk(idsByKind.track)) { const { data } = await sb.from('tracks').select('id, title, slug, cover_url, artists:artist_id(name, slug)').in('id', c); for (const t of data || []) trkMap.set(t.id, t) }
  const items = { artists: [] as ReviewHit[], albums: [] as ReviewHit[], tracks: [] as ReviewHit[] }
  for (const x of r) {
    if (x.kind === 'artist') { const a = artMap.get(x.matched_id); if (a) items.artists.push({ itemId: x.id, id: a.id, name: a.name, slug: a.slug, cover: a.cover_image_url ?? null, artist: null, artistSlug: null, pop: x.pop || 0 }) }
    else if (x.kind === 'album') { const a = albMap.get(x.matched_id); if (a) { const ar = Array.isArray(a.artists) ? a.artists[0] : a.artists; items.albums.push({ itemId: x.id, id: a.id, name: a.title, slug: a.slug, cover: a.cover_image_url ?? null, artist: ar?.name ?? null, artistSlug: ar?.slug ?? null, pop: x.pop || 0 }) } }
    else { const t = trkMap.get(x.matched_id); if (t) { const ar = Array.isArray(t.artists) ? t.artists[0] : t.artists; items.tracks.push({ itemId: x.id, id: t.id, name: t.title, slug: t.slug, cover: t.cover_url ?? null, artist: ar?.name ?? null, artistSlug: ar?.slug ?? null, pop: x.pop || 0 }) } }
  }
  // rikiuojam pagal populiarumą (kad svarbiausi viršuje)
  for (const k of ['artists', 'albums', 'tracks'] as const) items[k].sort((a, b) => b.pop - a.pop)
  const missing = ((job as any).processed || 0) - r.length
  return { status: (job as any).status, matched: r.length, missing: missing > 0 ? missing : 0, items }
}

// ── PATVIRTINIMAS — keliam pasirinktus į biblioteką + neatpažintus į trūkstamus
export async function confirmImportJob(userId: string, jobId: string, deselect: number[] = []): Promise<{ ok: boolean; added: number; reported: number; batchId: string | null; error?: string }> {
  const sb = createAdminClient()
  const { data: job } = await sb.from('music_import_jobs').select('id, user_id, status').eq('id', jobId).maybeSingle()
  if (!job || (job as any).user_id !== userId) return { ok: false, added: 0, reported: 0, batchId: null, error: 'Importas nerastas' }
  if ((job as any).status === 'done') return { ok: true, added: 0, reported: 0, batchId: null }
  const deselectSet = new Set<number>(deselect)
  const { data: batchRow } = await sb.from('music_import_batches').select('id').eq('job_id', jobId).maybeSingle()
  const batchId: string | null = (batchRow as any)?.id ?? null

  const { data: rows } = await sb.from('music_import_job_items')
    .select('id, kind, matched_id, pop, raw_artist, raw_title').eq('job_id', jobId).limit(8000)
  const byKind: Record<FavKind, number[]> = { artist: [], album: [], track: [] }
  const weights: Record<FavKind, Record<number, number>> = { artist: {}, album: {}, track: {} }
  const missing: any[] = []
  for (const x of (rows || []) as any[]) {
    if (x.matched_id) {
      if (deselectSet.has(x.id)) continue
      const k = x.kind as FavKind
      byKind[k].push(x.matched_id)
      if (x.pop) weights[k][x.matched_id] = x.pop
    } else { missing.push(x) }
  }

  let added = 0
  for (const kind of ['artist', 'album', 'track'] as FavKind[]) {
    const idsK = byKind[kind]
    if (!idsK.length) continue
    const { data: ex } = await sb.from('likes').select('entity_id').eq('user_id', userId).eq('entity_type', kind).in('entity_id', idsK)
    const have = new Set<number>(((ex || []) as any[]).map(y => y.entity_id))
    const fresh = idsK.filter(id => !have.has(id))
    if (batchId && fresh.length) for (let i = 0; i < fresh.length; i += 200) await sb.from('music_import_added').upsert(fresh.slice(i, i + 200).map(id => ({ batch_id: batchId, kind, entity_id: id })), { ignoreDuplicates: true })
    await addToLibrary(userId, kind, idsK, weights[kind])
    added += idsK.length
  }

  // neatpažintus — į „trūkstamą muziką" (su naudotojo ryšiu)
  let reported = 0
  if (missing.length) {
    const mk = (x: any): StagedHit => ({ raw: x.kind === 'artist' ? x.raw_artist : x.raw_title, rawArtist: x.raw_artist, matched: false, confidence: 'low' })
    const staged: StagedResult = {
      artists: missing.filter(x => x.kind === 'artist').map(mk),
      albums: missing.filter(x => x.kind === 'album').map(mk),
      tracks: missing.filter(x => x.kind === 'track').map(mk),
      counts: { matched: 0, unmatched: missing.length, total: missing.length },
    }
    try { reported = (await reportMissingImport(userId, staged, 'import')).reported } catch {}
  }

  if (batchId) await sb.from('music_import_batches').update({ added }).eq('id', batchId)
  await sb.from('music_import_jobs').update({ status: 'done', reported }).eq('id', jobId)
  return { ok: true, added, reported, batchId }
}
