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
import { matchItems, reportMissingImport, type RawItems } from '@/lib/music-import'
import { addToLibrary } from '@/lib/mano-muzika'
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
const FETCH_PAGES_PER_TICK = 20   // kiek Last.fm puslapių vienam fetch žingsniui
const MATCH_BATCH = 150           // kiek įrašų atpažįstame per batch'ą

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
  return r.json()
}

function toItem(kind: Kind, it: any): { kind: Kind; artist: string; title: string | null } | null {
  if (kind === 'artist') return it?.name ? { kind, artist: it.name, title: null } : null
  if (it?.['@attr']?.nowplaying) return null
  const artist = it?.artist?.name || it?.artist?.['#text'] || ''
  const title = it?.name || ''
  return artist && title ? { kind, artist, title } : null
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
  return { id: (data as any).id, existing: false }
}

export async function getLatestJob(userId: string) {
  const sb = createAdminClient()
  const { data } = await sb.from('music_import_jobs')
    .select('id, status, phase, total, processed, matched, reported, error, created_at, finished_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data || null
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
    while (Date.now() - t0 < budgetMs) {
      if (cur.phase === 'fetch') {
        await fetchTick(sb, cur)
      } else if (cur.phase === 'match') {
        const more = await matchTick(sb, cur)
        if (!more) break
      } else break
      const { data: fresh } = await sb.from('music_import_jobs').select('*').eq('id', job.id).maybeSingle()
      if (!fresh) break
      cur = fresh
      if (cur.status === 'done') break
    }
    const { data: f } = await sb.from('music_import_jobs').select('status').eq('id', job.id).maybeSingle()
    if (f && (f as any).status !== 'done') await sb.from('music_import_jobs').update({ locked_at: null }).eq('id', job.id)
    return { ok: true, jobId: job.id }
  } catch (e: any) {
    await sb.from('music_import_jobs').update({ status: 'error', error: String(e?.message || e).slice(0, 500), locked_at: null }).eq('id', job.id)
    return { ok: false, jobId: job.id, error: String(e?.message || e) }
  }
}

async function fetchTick(sb: any, job: any): Promise<void> {
  const user = String(job.params?.username || '').trim().replace(/^@/, '')
  if (!user) throw new Error('Job be Last.fm username')
  const cursor = job.fetch_cursor || {}
  let si = cursor.si ?? 0
  let page = cursor.page ?? 1
  let got = cursor.got ?? 0
  let pages = 0
  const rows: any[] = []

  while (si < FULL_STREAMS.length && pages < FETCH_PAGES_PER_TICK) {
    const st = FULL_STREAMS[si]
    const data = await lastfmCall(st.method, user, `limit=${PER_PAGE}&page=${page}&${st.extra}`).catch(() => null)
    pages++
    const container = data?.[st.root]
    const items = container?.[st.listKey]
    const arr = Array.isArray(items) ? items : (items ? [items] : [])
    for (const it of arr) {
      if (got >= st.cap) break
      const rec = toItem(st.kind, it)
      if (!rec) continue
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
          job_id: job.id, kind: r.kind, raw_artist: r.artist, raw_title: r.title, norm: normKey(r.kind, r.artist, r.title),
        })),
        { onConflict: 'job_id,norm', ignoreDuplicates: true },
      )
    }
  }

  if (si >= FULL_STREAMS.length) {
    const { count } = await sb.from('music_import_job_items').select('*', { count: 'exact', head: true }).eq('job_id', job.id)
    await sb.from('music_import_jobs').update({ phase: 'match', total: count || 0, fetch_cursor: { si, page, got } }).eq('id', job.id)
  } else {
    await sb.from('music_import_jobs').update({ fetch_cursor: { si, page, got } }).eq('id', job.id)
  }
}

async function matchTick(sb: any, job: any): Promise<boolean> {
  const userId = job.user_id
  const { data: items } = await sb.from('music_import_job_items')
    .select('id, kind, raw_artist, raw_title').eq('job_id', job.id).eq('status', 'pending').limit(MATCH_BATCH)
  if (!items || !items.length) { await finishJob(sb, job); return false }

  const raw: RawItems = { artists: [], tracks: [], albums: [] }
  for (const it of items as any[]) {
    if (it.kind === 'artist') raw.artists!.push({ name: it.raw_artist })
    else if (it.kind === 'album') raw.albums!.push({ artist: it.raw_artist, title: it.raw_title })
    else raw.tracks!.push({ artist: it.raw_artist, title: it.raw_title })
  }

  const staged = await matchItems(raw, { perKindLimit: MATCH_BATCH })
  const mArtists = staged.artists.filter(h => h.matched && h.id).map(h => h.id!)
  const mAlbums = staged.albums.filter(h => h.matched && h.id).map(h => h.id!)
  const mTracks = staged.tracks.filter(h => h.matched && h.id).map(h => h.id!)
  await addToLibrary(userId, 'artist', mArtists)
  await addToLibrary(userId, 'album', mAlbums)
  await addToLibrary(userId, 'track', mTracks)

  let reported = 0
  try { reported = (await reportMissingImport(userId, staged, 'import')).reported } catch {}
  const matchedCount = mArtists.length + mAlbums.length + mTracks.length

  const ids = (items as any[]).map(x => x.id)
  await sb.from('music_import_job_items').update({ status: 'done' }).in('id', ids)
  await sb.from('music_import_jobs').update({
    processed: (job.processed || 0) + items.length,
    matched: (job.matched || 0) + matchedCount,
    reported: (job.reported || 0) + reported,
  }).eq('id', job.id)
  return true
}

async function finishJob(sb: any, job: any): Promise<void> {
  const { data: fresh } = await sb.from('music_import_jobs')
    .select('matched, reported, notified, user_id').eq('id', job.id).maybeSingle()
  const f: any = fresh || job
  await sb.from('music_import_jobs')
    .update({ status: 'done', phase: 'done', finished_at: new Date().toISOString(), locked_at: null }).eq('id', job.id)
  if (f.notified) return
  await sb.from('music_import_jobs').update({ notified: true }).eq('id', job.id)
  try {
    const { data: prof } = await sb.from('profiles').select('email').eq('id', f.user_id).maybeSingle()
    const matched = f.matched || 0
    const reported = f.reported || 0
    await createNotification({
      user_id: f.user_id,
      recipient_email: (prof as any)?.email || null,
      type: 'system',
      title: 'Muzikos importas baigtas',
      snippet: `Į tavo muziką pridėjome ${matched} įrašų` + (reported > 0 ? `, dar ${reported} laukia įkėlimo ir atsiras vėliau` : ''),
      url: '/mano-muzika',
      data: { kind: 'music_import', matched, reported },
    })
  } catch {}
}
