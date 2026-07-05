#!/usr/bin/env node
/**
 * Boombox eilės atkūrimas (žaidimų zonos v1 dalis, 2026-07-05).
 *
 * Kontekstas: seni boombox drop'ai buvo ištrinti iš DB (image/duel/verdict = 0
 * eilučių), todėl /boombox rodo "nėra turinio". Šis skriptas atkuria eilę ta
 * pačia logika kaip /api/admin/boombox/generate (duels + verdicts):
 *   - Dvikovos: poros iš top-score track'ų, 3 matchup tipai rotacija,
 *     ta pati šalis (LT-LT arba foreign-foreign), skirtingi atlikėjai,
 *     kiekvienas track'as naudojamas vienąkart.
 *   - Verdiktai: švieži track'ai su video (12 mėn / einamieji metai),
 *     distinct atlikėjai.
 *
 * Naudojimas:
 *   node scripts/seed-zaidimai-content.mjs [--duels-lt 40] [--duels-foreign 20] [--verdicts 30]
 *
 * Reikia .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Idempotencija: praleidžia poras/track'us, kurie jau yra ready eilėje.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch (_e) { /* ok */ }
}
loadEnvLocal()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('Trūksta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY .env.local'); process.exit(1) }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } })

const args = process.argv.slice(2)
function argNum(name, dflt) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1]) : dflt
}
const DUELS_LT = argNum('--duels-lt', 40)
const DUELS_FOREIGN = argNum('--duels-foreign', 20)
const VERDICTS = argNum('--verdicts', 30)

const CURRENT_YEAR = new Date().getFullYear()
const NEW_THRESHOLD = CURRENT_YEAR - 2
const OLD_THRESHOLD = CURRENT_YEAR - 5

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function loadCandidates(scope, requireVideo = false, limit = 1500) {
  // SVARBU: country filtras DB pusėje (!inner join) — kitaip top-1500 pagal
  // score dominuoja užsienio track'ai ir LT scope lieka tuščias.
  let q = sb
    .from('tracks')
    .select('id, title, artist_id, release_year, release_date, video_url, score, artists:artist_id!inner ( id, country )')
    .order('score', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (scope === 'lt') q = q.eq('artists.country', 'Lietuva')
  else if (scope === 'foreign') q = q.neq('artists.country', 'Lietuva')
  if (requireVideo) q = q.not('video_url', 'is', null)
  const { data, error } = await q
  if (error) { console.error('tracks query:', error.message); return [] }
  const out = []
  for (const row of data || []) {
    out.push({ id: row.id, title: row.title, artist_id: row.artist_id, release_year: row.release_year, release_date: row.release_date, video_url: row.video_url, score: row.score })
  }
  // release_year backfill iš album.year
  const missing = out.filter(t => t.release_year == null).map(t => t.id)
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 300) {
      const chunk = missing.slice(i, i + 300)
      const { data: links } = await sb.from('album_tracks').select('track_id, albums:album_id ( year )').in('track_id', chunk)
      const byTrack = new Map()
      for (const l of links || []) {
        const alb = Array.isArray(l.albums) ? l.albums[0] : l.albums
        if (alb?.year && !byTrack.has(l.track_id)) byTrack.set(l.track_id, alb.year)
      }
      for (const t of out) if (t.release_year == null && byTrack.has(t.id)) t.release_year = byTrack.get(t.id)
    }
  }
  return out
}

function pickPair(poolA, poolB, used) {
  for (const a of poolA) {
    if (used.has(a.id)) continue
    for (const b of poolB) {
      if (b.id === a.id || used.has(b.id) || b.artist_id === a.artist_id) continue
      return [a, b]
    }
  }
  return null
}

async function seedDuels(count, scope) {
  const candidates = await loadCandidates(scope, false)
  const withYear = candidates.filter(t => t.release_year != null)
  if (withYear.length < 4) { console.log(`[duels ${scope}] per mažai kandidatų (${withYear.length})`); return 0 }

  // Jau eilėje esantys track'ai — nekartojam
  const { data: existing } = await sb.from('boombox_duel_drops').select('track_a_id, track_b_id').neq('status', 'archived')
  const used = new Set()
  for (const d of existing || []) { used.add(d.track_a_id); used.add(d.track_b_id) }

  const newOnes = shuffle(withYear.filter(t => t.release_year >= NEW_THRESHOLD))
  const oldOnes = shuffle(withYear.filter(t => t.release_year <= OLD_THRESHOLD))
  const middle = shuffle(withYear.filter(t => t.release_year > OLD_THRESHOLD && t.release_year < NEW_THRESHOLD))
  const all = shuffle(withYear)

  const { data: last } = await sb.from('boombox_duel_drops').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  let nextSort = (last?.sort_order || 0) + 1

  const inserts = []
  for (let i = 0; i < count; i++) {
    const matchup = ['new_vs_new', 'old_vs_old', 'old_vs_new'][i % 3]
    let pair = null
    if (matchup === 'new_vs_new') pair = pickPair(newOnes, newOnes, used) || pickPair(all, all, used)
    else if (matchup === 'old_vs_old') pair = pickPair(oldOnes, oldOnes, used) || pickPair(middle, middle, used) || pickPair(all, all, used)
    else pair = pickPair(oldOnes, newOnes, used) || pickPair(middle, newOnes, used) || pickPair(oldOnes, middle, used) || pickPair(all, all, used)
    if (!pair) break
    used.add(pair[0].id); used.add(pair[1].id)
    inserts.push({ matchup_type: matchup, track_a_id: pair[0].id, track_b_id: pair[1].id, status: 'ready', sort_order: nextSort++ })
  }
  if (!inserts.length) { console.log(`[duels ${scope}] nepavyko suporuoti`); return 0 }
  const { error } = await sb.from('boombox_duel_drops').insert(inserts)
  if (error) { console.error(`[duels ${scope}]`, error.message); return 0 }
  console.log(`[duels ${scope}] +${inserts.length}`)
  return inserts.length
}

async function seedVerdicts(count) {
  const candidates = await loadCandidates('lt', true)
  const twelveMo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
  const sixMo = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)
  const fresh = candidates.filter(t => (t.release_date && t.release_date >= twelveMo) || (t.release_year && t.release_year >= CURRENT_YEAR))
  if (!fresh.length) { console.log('[verdicts] nėra šviežių'); return 0 }

  const { data: existing } = await sb.from('boombox_verdict_drops').select('track_id').neq('status', 'archived')
  const usedTracks = new Set((existing || []).map(r => r.track_id))

  const scored = fresh
    .map(t => {
      let rank = 0
      if (t.release_date && t.release_date >= sixMo) rank += 200
      else if (t.release_date && t.release_date >= twelveMo) rank += 100
      else if (t.release_year && t.release_year >= CURRENT_YEAR) rank += 50
      rank += (t.score || 0) * 0.1
      return { t, rank }
    })
    .sort((a, b) => b.rank - a.rank)
    .map(x => x.t)

  const seenArtists = new Set()
  const picks = []
  for (const t of scored) {
    if (picks.length >= count) break
    if (usedTracks.has(t.id) || seenArtists.has(t.artist_id)) continue
    seenArtists.add(t.artist_id)
    picks.push(t)
  }
  if (!picks.length) { console.log('[verdicts] visi jau eilėje'); return 0 }

  const { data: last } = await sb.from('boombox_verdict_drops').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  let nextSort = (last?.sort_order || 0) + 1
  const inserts = picks.map(t => ({ track_id: t.id, status: 'ready', sort_order: nextSort++ }))
  const { error } = await sb.from('boombox_verdict_drops').insert(inserts)
  if (error) { console.error('[verdicts]', error.message); return 0 }
  console.log(`[verdicts] +${inserts.length}`)
  return inserts.length
}

const dl = await seedDuels(DUELS_LT, 'lt')
const df = await seedDuels(DUELS_FOREIGN, 'foreign')
const v = await seedVerdicts(VERDICTS)
console.log(`Iš viso: ${dl + df} dvikovų, ${v} verdiktų.`)
