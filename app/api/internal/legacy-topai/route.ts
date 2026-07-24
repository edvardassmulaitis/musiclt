import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday } from '@/lib/top-week'
import { authorizeCron } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/internal/legacy-topai — senojo www.music.lt savaitinių TOP 40 /
 * LT TOP 30 archyvo nuscrapinimas į top_weeks / top_entries.
 *
 * TS portas iš scraper/charts/legacy_top_archive.py (validuota 2026-07-24).
 * PERĖJIMO periodas: kol nauja balsavimo sistema neturi balsuotojų, imam topus
 * iš music.lt (override-live: perrašom tuščias live savaites + rodom šviežiausią
 * kaip einamą per resolveDisplayWeek / /api/top/entries fallback).
 *
 * Šaltinis (reverse-engineered iš /top40 archyvo JS):
 *   GET /ajax.php?top;from.{monday};to.{sunday};topid.{1|2}  → savaitės HTML.
 *   topid 1 = top40, 2 = lt_top30. Kiekvienas įrašas: /lt/daina/{slug}/{legacy_id}/.
 *
 * Idempotentiška: upsert pagal (top_type, week_start); entries delete-then-insert.
 * Kas savaitę atnaujina paskutines WEEKS_BACK savaites (persidengimas saugumui).
 *
 * Vercel Cron (sekmadienį vakare) siunčia Authorization: Bearer $CRON_SECRET.
 * Rankinis trigger'is: ?key=<CRON_SECRET|INTERNAL_CRON_TOKEN> (allowQueryKey).
 */

const BASE = 'https://www.music.lt'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
const TOPID_TYPE: Record<number, string> = { 1: 'top40', 2: 'lt_top30' }
const WEEKS_BACK = 3 // kiek paskutinių savaičių atnaujinti kas paleidimą

type ParsedEntry = {
  position: number
  legacy_track_id: number
  title: string
  artist_name: string
  weeks_in_top: number | null
  peak_position: number | null
  change: string
}

async function fetchWeek(monday: string, sunday: string, topid: number): Promise<string> {
  const url = `${BASE}/ajax.php?top;from.${monday};to.${sunday};topid.${topid}`
  const r = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' })
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`)
  return await r.text()
}

const RE_POS = /class="large">\s*(\d+)/
const RE_DAINA = /(?:lt\/)?daina\/([^/"]+)\/(\d+)/
const RE_GRUPE = /(?:lt\/)?grupe\/([^/"]+)\/(\d+)/
const RE_TITLE = /<a[^>]*title="([^"]*)"[^>]*>\s*<b>/
const RE_META = /Savaičių tope:\s*(\d+)[\s\S]*?aukščiausia vieta:\s*(\d+)/
const RE_CHANGE = /class="large">\s*\d+\s*<br\s*\/?>\s*<span[^>]*>\s*([^<]*)<\/span>/
const RE_GRUPE_TXT = /grupe\/[^"]+\/\d+\/">([^<]+)<\/a>/

function slugToName(slug: string): string {
  try { return decodeURIComponent(slug).replace(/-/g, ' ').trim() } catch { return slug.replace(/-/g, ' ').trim() }
}

function parseWeek(html: string): ParsedEntry[] {
  const out: ParsedEntry[] = []
  const blocks = html.split('<tr class="table_row"').slice(1)
  for (const b of blocks) {
    const mpos = RE_POS.exec(b)
    const mdaina = RE_DAINA.exec(b)
    if (!mpos || !mdaina) continue
    const pos = parseInt(mpos[1], 10)
    const tid = parseInt(mdaina[2], 10)
    const mtitle = RE_TITLE.exec(b)
    const title = mtitle ? mtitle[1].trim() : ''
    const mgr = RE_GRUPE.exec(b)
    let artist_name = ''
    if (mgr) {
      const mtxt = RE_GRUPE_TXT.exec(b)
      artist_name = mtxt ? mtxt[1].trim() : slugToName(mgr[1])
    }
    const mmeta = RE_META.exec(b)
    const weeks_in = mmeta ? parseInt(mmeta[1], 10) : null
    const peak = mmeta ? parseInt(mmeta[2], 10) : null
    const mch = RE_CHANGE.exec(b)
    const change = mch ? mch[1].trim() : ''
    out.push({ position: pos, legacy_track_id: tid, title, artist_name, weeks_in_top: weeks_in, peak_position: peak, change })
  }
  // dedupe pagal poziciją (header'is kartais įsimaišo)
  const seen = new Map<number, ParsedEntry>()
  for (const e of out) seen.set(e.position, e)
  return [...seen.keys()].sort((a, b) => a - b).map((p) => seen.get(p)!)
}

function prevFromChange(pos: number, weeksIn: number | null, change: string): { prev: number | null; isNew: boolean } {
  const c = (change || '').toUpperCase()
  if (c.includes('NAUJ') || c.includes('NEW') || weeksIn === 1) return { prev: null, isNew: true }
  const m = /([+-]?\d+)/.exec(c)
  if (!m) return { prev: pos, isNew: false }
  const delta = parseInt(m[1], 10) // +N pakilo (prev žemiau), -N nukrito
  const prev = pos + delta
  return { prev: prev > 0 ? prev : null, isNew: false }
}

async function matchTracks(sb: any, legacyIds: number[]): Promise<Map<number, { id: number; artist_id: number | null }>> {
  const res = new Map<number, { id: number; artist_id: number | null }>()
  for (let i = 0; i < legacyIds.length; i += 150) {
    const chunk = legacyIds.slice(i, i + 150)
    const { data } = await sb.from('tracks').select('id, legacy_id, artist_id').in('legacy_id', chunk)
    for (const r of (data || [])) res.set(r.legacy_id, { id: r.id, artist_id: r.artist_id })
  }
  return res
}

async function getOrCreateWeek(sb: any, topType: string, weekStart: string): Promise<{ id: number; overridden: boolean } | null> {
  const { data: rows } = await sb.from('top_weeks').select('id, is_legacy, is_active').eq('top_type', topType).eq('week_start', weekStart).limit(1)
  const w = rows?.[0]
  if (w) {
    let overridden = false
    if (!w.is_legacy) {
      // override-live: perimam tuščią/live savaitę music.lt duomenimis.
      await sb.from('top_weeks').update({ is_legacy: true, is_finalized: true, is_active: false }).eq('id', w.id)
      overridden = true
    }
    return { id: w.id, overridden }
  }
  const { data: created, error } = await sb.from('top_weeks').insert({
    top_type: topType, week_start: weekStart, is_legacy: true, is_finalized: true,
    is_active: false, total_votes: 0, vote_close: `${weekStart}T23:59:59+00:00`,
  }).select('id').single()
  if (error) throw new Error(`week create ${topType} ${weekStart}: ${error.message}`)
  return { id: created.id, overridden: false }
}

async function storeWeek(sb: any, topType: string, weekStart: string, entries: ParsedEntry[]): Promise<{ entries: number; matched: number }> {
  const wk = await getOrCreateWeek(sb, topType, weekStart)
  if (!wk) return { entries: 0, matched: 0 }
  const matchedMap = await matchTracks(sb, entries.map((e) => e.legacy_track_id))
  const rows = entries.map((e) => {
    const m = matchedMap.get(e.legacy_track_id)
    const { prev, isNew } = prevFromChange(e.position, e.weeks_in_top, e.change)
    return {
      week_id: wk.id, top_type: topType, position: e.position,
      track_id: m ? m.id : null, legacy_track_id: e.legacy_track_id,
      artist_name: e.artist_name || null, title: e.title || null,
      prev_position: prev, is_new: isNew, weeks_in_top: e.weeks_in_top,
      peak_position: e.peak_position, total_votes: 0,
    }
  })
  // Dedupe kanoninį track_id savaitėje (kelios legacy versijos → tas pats track):
  // geriausią poziciją paliekam su track_id, dublikatams track_id=NULL (NULL nelaužia
  // (week_id, track_id) unique constraint'o).
  const seenTid = new Set<number>()
  for (const r of [...rows].sort((a, b) => a.position - b.position)) {
    if (r.track_id == null) continue
    if (seenTid.has(r.track_id)) r.track_id = null
    else seenTid.add(r.track_id)
  }
  const matched = rows.filter((r) => r.track_id != null).length
  await sb.from('top_entries').delete().eq('week_id', wk.id)
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from('top_entries').insert(rows.slice(i, i + 100))
    if (error) throw new Error(`entries insert ${topType} ${weekStart}: ${error.message}`)
  }
  return { entries: rows.length, matched }
}

function mondaysBack(n: number): string[] {
  const cur = getCurrentWeekMonday() // 'YYYY-MM-DD'
  const base = new Date(cur + 'T00:00:00Z')
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() - i * 7)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(req, { allowQueryKey: true }))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = createAdminClient()
  const results: Record<string, string> = {}
  const scrapedStarts: Record<number, Set<string>> = { 1: new Set(), 2: new Set() }
  const weeks = mondaysBack(WEEKS_BACK)

  for (const monday of weeks) {
    const sunday = (() => { const d = new Date(monday + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10) })()
    for (const topid of [1, 2]) {
      const topType = TOPID_TYPE[topid]
      const tag = `${topType} ${monday}`
      try {
        const html = await fetchWeek(monday, sunday, topid)
        const entries = parseWeek(html)
        if (!entries.length) { results[tag] = 'tuščia (music.lt dar nepaskelbė)'; continue }
        scrapedStarts[topid].add(monday)
        const r = await storeWeek(sb, topType, monday, entries)
        results[tag] = `${r.entries} įrašų, ${r.matched} matched`
      } catch (e: any) {
        results[tag] = `klaida: ${e.message}`
      }
    }
  }

  // Einamosios savaitės stub: jei music.lt jos dar nepaskelbė, išvalom stub entries,
  // kad resolveDisplayWeek / /api/top/entries fallback'intų į šviežiausią music.lt savaitę.
  const cw = getCurrentWeekMonday()
  for (const topid of [1, 2]) {
    if (scrapedStarts[topid].has(cw)) continue
    const topType = TOPID_TYPE[topid]
    const { data: rows } = await sb.from('top_weeks').select('id, is_legacy').eq('top_type', topType).eq('week_start', cw).limit(1)
    const w = rows?.[0]
    if (!w || w.is_legacy) continue
    const { data: ents } = await sb.from('top_entries').select('id').eq('week_id', w.id).limit(1)
    if (ents?.length) { await sb.from('top_entries').delete().eq('week_id', w.id); results[`clear ${topType} ${cw}`] = 'stub išvalytas → fallback' }
  }

  // Relink pagal atlikėją+pavadinimą (fresh entries be legacy_id match → katalogo track).
  let relinked: any = null
  try { const { data } = await sb.rpc('relink_top_entries_by_name'); relinked = data } catch (e: any) { relinked = `rpc klaida: ${e.message}` }

  return NextResponse.json({ ok: true, weeks, results, relinked, at: new Date().toISOString() })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
