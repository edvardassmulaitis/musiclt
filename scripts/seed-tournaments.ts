#!/usr/bin/env node
// @ts-nocheck — utility skriptas, vykdomas per tsx (ne build'e)
/**
 * Dainų „playoffs" seed'as — sukuria vieno stiliaus knockout turnyrą.
 *
 * Naudojimas (per tsx — importuoja lib/tournament.ts):
 *   npx tsx scripts/seed-tournaments.ts --dry            # tik atspausdina bracket'ą
 *   npx tsx scripts/seed-tournaments.ts --genre 1000562  # konkretus stilius
 *   npx tsx scripts/seed-tournaments.ts                  # visi 8 stiliai į queue
 *
 * Reikia .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Rašymas reikalauja, kad būtų pritaikyta 20260711b_boombox_tournaments.sql.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  STYLE_POPULARITY, bracketSizeForStyle, voteFromRound, buildBracket,
} from '../lib/tournament'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const GENRE_NAMES = {
  1000556: 'Alternatyva', 1000557: 'Elektroninė, šokių', 1000558: 'Hip-hop', 1000559: 'Kitų stilių',
  1000560: 'Pop, R&B', 1000561: 'Rimtoji', 1000562: 'Rokas', 1000563: 'Sunkioji',
}
const args = process.argv.slice(2)
const dry = args.includes('--dry')

/** artist_id → genre_id (viena grupė kiekvienam). */
async function artistGenreMap() {
  const map = new Map()
  let from = 0
  for (;;) {
    const { data } = await sb.from('artist_genres').select('artist_id,genre_id')
      .in('genre_id', STYLE_POPULARITY).range(from, from + 999)
    for (const r of data) if (!map.has(r.artist_id)) map.set(r.artist_id, r.genre_id)
    if (data.length < 1000) break; from += 1000
  }
  return map
}

/**
 * VIENAS pass'as per populiarias dainas — surenka geriausią (daugiausiai
 * peržiūrų) dainą kiekvienam atlikėjui, sugrupuotą pagal stilių.
 * Grąžina Map<genreId, Song[]> jau surūšiuotą pagal views (populiariausios pirmos).
 */
async function gatherTopSongs(targets, agMap) {
  const targetSet = new Set(targets)
  // per stilių: artistId → geriausia daina
  const perStyle = new Map(targets.map(g => [g, new Map()]))
  let lastId = 0, scanned = 0
  for (;;) {
    const { data, error } = await sb.from('tracks')
      .select('id,title,artist_id,video_views,video_url,artists:artist_id!inner(name)')
      .not('video_url', 'is', null).gte('video_views', 10000).gt('id', lastId)
      .order('id', { ascending: true }).limit(1000)
    if (error) throw error
    if (!data.length) break
    for (const t of data) {
      scanned++
      const g = agMap.get(t.artist_id)
      if (!targetSet.has(g)) continue
      const byArtist = perStyle.get(g)
      const v = t.video_views || 0
      const cur = byArtist.get(t.artist_id)
      if (!cur || v > cur.views) byArtist.set(t.artist_id, { trackId: t.id, views: v, title: t.title, artist: t.artists?.name })
    }
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  const out = new Map()
  for (const [g, byArtist] of perStyle) {
    out.set(g, [...byArtist.values()].sort((a, b) => b.views - a.views))
  }
  console.log(`  (peržiūrėta ${scanned.toLocaleString()} populiarių dainų)`)
  return out
}

async function seedStyle(genreId, sortOrder, songsAll) {
  const size = bracketSizeForStyle(genreId)
  const songs = (songsAll.get(genreId) || []).slice(0, size)
  if (songs.length < size) { console.log(`  ⚠ ${GENRE_NAMES[genreId]}: tik ${songs.length}/${size} dainų — praleidžiam`); return }
  const seeds = songs.map(s => ({ trackId: s.trackId, views: s.views }))
  const matches = buildBracket(seeds, size)
  const auto = matches.filter(m => m.decidedBy === 'seed').length
  console.log(`  ${GENRE_NAMES[genreId]}: ${size} dainų, ${matches.length} matų (${auto} auto), balsavimas nuo rato ${voteFromRound(size)}`)
  console.log(`    #1 seed: ${songs[0].artist} — ${songs[0].title} (${songs[0].views.toLocaleString()} views)`)
  if (dry) return

  const { data: t, error: te } = await sb.from('boombox_tournaments').insert({
    genre_id: genreId, title: GENRE_NAMES[genreId], size, vote_from_round: voteFromRound(size),
    status: 'pending', current_round: 1, sort_order: sortOrder,
  }).select('id').single()
  if (te) throw te
  const rows = matches.map(m => ({
    tournament_id: t.id, round: m.round, slot: m.slot,
    track_a_id: m.aId, track_b_id: m.bId, winner_track_id: m.winnerId,
    decided_by: m.decidedBy, resolved_at: m.winnerId ? new Date().toISOString() : null,
  }))
  const { error: me } = await sb.from('boombox_tournament_matches').insert(rows)
  if (me) throw me
  console.log(`    ✓ įrašyta turnyras #${t.id} + ${rows.length} matų`)
}

async function main() {
  const genreArg = args.includes('--genre') ? Number(args[args.indexOf('--genre') + 1]) : null
  const targets = genreArg ? [genreArg] : STYLE_POPULARITY
  console.log(dry ? '— DRY RUN —' : '— SEEDING —')
  const agMap = await artistGenreMap()
  const songsAll = await gatherTopSongs(targets, agMap)
  let i = 0
  for (const g of targets) { await seedStyle(g, i++, songsAll) }
  console.log('Baigta.')
}
main().catch(e => { console.error(e); process.exit(1) })
