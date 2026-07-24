import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { authorizeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/internal/legacy-dienos-daina — senojo www.music.lt „dienos daina"
 * (song of the day) archyvo nuscrapinimas į daily_song_picks + daily_song_winners.
 *
 * TS portas iš scraper/daily_song_scrape.py (Edvardo validuota logika).
 * Šaltinis (globalus archyvas, viena diena = vienas puslapis):
 *   GET /?song;song_of_day;history.<YYYY-MM-DD>
 *   Kiekviena <tr class="table_row"> = nario pasiūlyta tos dienos daina:
 *     • Pasiūlė:  /user/<username>            → profiles.username(_norm)
 *     • Daina:    lt/daina/<slug>/<legacy>/   → tracks.legacy_id
 *     • Mėgsta:   ?rate;list.60;id.<pick>  + <label ...>N</label>  (like_count)
 *   picked_on = puslapio data (iš URL). Winner = daugiausiai „Mėgsta" pick'as,
 *   kurio daina YRA kataloge (track_id). Idempotentiška (upsert).
 *
 * Kasdien scan'inam paskutines ?days dienų (default 7) — persidengimas saugumui.
 * Didesniam catch-up'ui: ?days=30 (arba ?minDate=YYYY-MM-DD). Rankinis trigger'is:
 * ?key=<CRON_SECRET|INTERNAL_CRON_TOKEN>. Vercel Cron siunčia Authorization header'į.
 */

const BASE = 'https://www.music.lt'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

type Pick = { pickLegacyId: number | null; username: string; trackLegacyId: number; likeCount: number }

const RE_ROW = /<tr\s+class="table_row">([\s\S]*?)<\/tr>/gi
const RE_USER = /href="\/user\/([A-Za-z0-9_.\-]+)"/i
const RE_TRACK = /\/?lt\/daina\/[^/"']+\/(\d+)/i
const RE_PICK = /\?rate;list\.60;id\.(\d+)/i
const RE_LIKE = /<label[^>]*id="favorite_60_count\d+[^"]*"[^>]*>(\d+)<\/label>/i
const RE_DAY_H2 = /muzika<\/h2>/i
const RE_NEXT_SECTION = /<div class="content_head">/i

/** Tik TOS dienos pasiūlymų lentelė: nuo „...muzika</h2>" iki sekančios
 *  content_head antraštės. (Puslapyje yra ir „Balsuokite" widget'as, kuris
 *  kartoja kitų dienų įrašus — jo NEimam, kitaip picked_on būtų blogas.) */
function daySection(html: string): string {
  const m = RE_DAY_H2.exec(html)
  if (!m) return ''
  const rest = html.slice(m.index + m[0].length)
  const stop = RE_NEXT_SECTION.exec(rest)
  return stop ? rest.slice(0, stop.index) : rest
}

function parseHistoryPage(html: string): Pick[] {
  const seg = daySection(html)
  if (!seg) return []
  const out: Pick[] = []
  RE_ROW.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RE_ROW.exec(seg)) !== null) {
    const row = m[1]
    const um = RE_USER.exec(row)
    const tm = RE_TRACK.exec(row)
    if (!um || !tm) continue // be nario arba dainos — nepilna eilutė
    const pm = RE_PICK.exec(row)
    const lm = RE_LIKE.exec(row)
    out.push({
      pickLegacyId: pm ? parseInt(pm[1], 10) : null,
      username: um[1],
      trackLegacyId: parseInt(tm[1], 10),
      likeCount: lm ? parseInt(lm[1], 10) : 0,
    })
  }
  return out
}

// ── Resolveriai su cache (per run'ą) ──
const userCache = new Map<string, string | null>()
const trackCache = new Map<number, number | null>()

async function resolveAuthor(sb: any, username: string): Promise<string | null> {
  if (userCache.has(username)) return userCache.get(username)!
  let aid: string | null = null
  const { data } = await sb.from('profiles').select('id').eq('username', username).limit(1)
  if (data?.[0]) aid = data[0].id
  else {
    const { data: d2 } = await sb.from('profiles').select('id').eq('username_norm', username.toLowerCase()).limit(1)
    if (d2?.[0]) aid = d2[0].id
  }
  userCache.set(username, aid)
  return aid
}

async function resolveTrack(sb: any, legacyId: number): Promise<number | null> {
  if (trackCache.has(legacyId)) return trackCache.get(legacyId)!
  let tid: number | null = null
  const { data } = await sb.from('tracks').select('id').eq('legacy_id', legacyId).limit(1)
  if (data?.[0]) tid = data[0].id
  trackCache.set(legacyId, tid)
  return tid
}

async function upsertDay(sb: any, ds: string, picks: Pick[]): Promise<{ picks: number; authless: number; winner: boolean }> {
  let stored = 0
  let authless = 0
  // ── Picks (UPSERT pagal (author_id, picked_on)) ──
  for (const p of picks) {
    const authorId = await resolveAuthor(sb, p.username)
    if (!authorId) { authless++; continue }
    const trackId = await resolveTrack(sb, p.trackLegacyId)
    const { error } = await sb.from('daily_song_picks').upsert({
      author_id: authorId,
      picked_on: ds,
      legacy_id: p.pickLegacyId,
      track_id: trackId,
      legacy_track_id: trackId ? null : p.trackLegacyId,
      like_count: p.likeCount,
      comment: null,
      source: 'legacy_scrape',
    }, { onConflict: 'author_id,picked_on' })
    if (!error) stored++
  }
  // ── Winner (daugiausiai „Mėgsta" pick'as, kurio daina yra kataloge) ──
  const cand = [...picks].filter(p => p.trackLegacyId)
    .sort((a, b) => (b.likeCount - a.likeCount) || ((a.pickLegacyId ?? 2 ** 40) - (b.pickLegacyId ?? 2 ** 40)))
  let winner = false
  for (const p of cand) {
    const tid = await resolveTrack(sb, p.trackLegacyId)
    if (!tid) continue
    const { error } = await sb.from('daily_song_winners').upsert({
      date: ds, track_id: tid,
      total_votes: p.likeCount, weighted_votes: p.likeCount,
      winning_comment: null, winning_user_id: null,
    }, { onConflict: 'date' })
    if (!error) winner = true
    break
  }
  return { picks: stored, authless, winner }
}

function fmt(d: Date): string { return d.toISOString().slice(0, 10) }

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req, { allowQueryKey: true }))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const days = Math.min(400, Math.max(1, parseInt(sp.get('days') || '7', 10)))
  const minDate = sp.get('minDate') // saugiklis
  const sb = createAdminClient()

  const results: Record<string, string> = {}
  let totPicks = 0, totWinners = 0
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  for (let i = 0; i < days; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const ds = fmt(d)
    if (minDate && ds < minDate) break
    try {
      const r = await fetch(`${BASE}/?song;song_of_day;history.${ds}`, { headers: { 'User-Agent': UA }, cache: 'no-store' })
      const html = r.ok ? await r.text() : ''
      const picks = html ? parseHistoryPage(html) : []
      if (!picks.length) { results[ds] = '0 pickų'; continue }
      const res = await upsertDay(sb, ds, picks)
      totPicks += res.picks; if (res.winner) totWinners++
      results[ds] = `picks=${picks.length} stored=${res.picks} be_nario=${res.authless}${res.winner ? ' WINNER✓' : ''}`
    } catch (e: any) {
      results[ds] = `klaida: ${e.message}`
    }
  }

  return NextResponse.json({ ok: true, days, totPicks, totWinners, results, at: new Date().toISOString() })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
