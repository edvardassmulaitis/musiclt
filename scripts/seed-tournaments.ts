#!/usr/bin/env node
// @ts-nocheck — utility skriptas, vykdomas per tsx (ne build'e)
/**
 * Dainų „playoffs" seed'as — dvi lygiagrečios eilės (LT ir pasaulio).
 *
 * Naudojimas:
 *   npx tsx scripts/seed-tournaments.ts --dry              # tik atspausdina
 *   npx tsx scripts/seed-tournaments.ts --scope lt --dry   # tik LT eilė
 *   npx tsx scripts/seed-tournaments.ts                    # seed'ina abi eiles
 *
 * Reikia .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Reikia migracijų: 20260711b_boombox_tournaments.sql + 20260712_tournaments_scope_substyle.sql
 *
 * DĖMESIO: skriptas NĖRA idempotentiškas kaip toks — bet DB turi unique indeksą
 * (scope, genre_id, substyle_id), tad pakartotinis paleidimas dublikatų nesukurs,
 * o praneš apie konfliktą ir praleis.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  STYLE_POPULARITY, SCOPES, bracketSizeForStyle, voteFromRound, buildBracket,
  splitsIntoSubstyles, SPLIT_INTO_SUBSTYLES, fitBracket, MIN_BRACKET,
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
const onlyScope = args.includes('--scope') ? args[args.indexOf('--scope') + 1] : null
const scopes = onlyScope ? [onlyScope] : SCOPES

/**
 * Puslapiuota selekcija (Supabase riboja 1000 eilučių).
 *
 * SVARBU: `orderBy` privalomas. Be stabilaus rikiavimo Postgres negarantuoja
 * eilučių tvarkos tarp .range() puslapių — dalis eilučių dingsta, dalis
 * pasikartoja, ir kaskart kitaip. Dėl to seed'as rado tai 12, tai 16 atlikėjų
 * ten, kur DB jų turi 30.
 */
async function pageAll(build, orderBy: string[]) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let qy = build()
    for (const col of orderBy) qy = qy.order(col, { ascending: true })
    const { data, error } = await qy.range(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/** artist_id → { genreId, isLt } */
async function artistIndex() {
  const genres = await pageAll(
    () => sb.from('artist_genres').select('artist_id,genre_id').in('genre_id', STYLE_POPULARITY),
    ['artist_id', 'genre_id'],
  )
  const artists = await pageAll(() => sb.from('artists').select('id,country'), ['id'])
  const country = new Map(artists.map(a => [a.id, a.country]))
  const map = new Map()
  for (const r of genres) {
    if (map.has(r.artist_id)) continue
    map.set(r.artist_id, { genreId: r.genre_id, isLt: country.get(r.artist_id) === 'Lietuva' })
  }
  return map
}

/** substyle_id → name, ir artist_id → Set<substyleName> (tik skaidomiems stiliams) */
async function substyleIndex() {
  const wanted = Object.values(SPLIT_INTO_SUBSTYLES).flat()
  const { data: subs, error } = await sb.from('substyles').select('id,name,genre_id').in('name', wanted)
  if (error) throw error
  const byName = new Map(subs.map(s => [s.name, s]))
  const ids = subs.map(s => s.id)
  const links = await pageAll(
    () => sb.from('artist_substyles').select('artist_id,substyle_id').in('substyle_id', ids),
    ['artist_id', 'substyle_id'],
  )
  const idToName = new Map(subs.map(s => [s.id, s.name]))
  const artistSubs = new Map()
  for (const l of links) {
    const n = idToName.get(l.substyle_id)
    if (!n) continue
    if (!artistSubs.has(l.artist_id)) artistSubs.set(l.artist_id, new Set())
    artistSubs.get(l.artist_id).add(n)
  }
  return { byName, artistSubs }
}

/**
 * VIENAS pass'as per populiarias dainas — geriausia (daugiausiai peržiūrų) daina
 * kiekvienam atlikėjui. Grąžina Map<artistId, Song>.
 */
async function gatherBestPerArtist() {
  const best = new Map()
  let lastId = 0, scanned = 0
  for (;;) {
    const { data, error } = await sb.from('tracks')
      .select('id,title,artist_id,video_views,artists:artist_id!inner(name)')
      .not('video_url', 'is', null).gte('video_views', 10000).gt('id', lastId)
      .order('id', { ascending: true }).limit(1000)
    if (error) throw error
    if (!data.length) break
    for (const t of data) {
      scanned++
      const v = t.video_views || 0
      const cur = best.get(t.artist_id)
      if (!cur || v > cur.views) {
        best.set(t.artist_id, { trackId: t.id, views: v, title: t.title, artist: t.artists?.name })
      }
    }
    lastId = data[data.length - 1].id
    if (data.length < 1000) break
  }
  console.log(`  (peržiūrėta ${scanned.toLocaleString('lt-LT')} populiarių dainų, ${best.size.toLocaleString('lt-LT')} atlikėjų)`)
  return best
}

/** Surenka kandidatus vienam turnyrui, surūšiuotus pagal peržiūras (mažėjančiai). */
function candidatesFor({ genreId, scope, substyleName }, best, aIndex, sIndex) {
  const out = []
  for (const [artistId, song] of best) {
    const info = aIndex.get(artistId)
    if (!info || info.genreId !== genreId) continue
    if (scope === 'lt' && !info.isLt) continue
    if (scope === 'world' && info.isLt) continue
    if (substyleName && !sIndex.artistSubs.get(artistId)?.has(substyleName)) continue
    out.push(song)
  }
  return out.sort((a, b) => b.views - a.views)
}

async function seedOne(spec, sortOrder, best, aIndex, sIndex) {
  const { genreId, scope, substyleName } = spec
  const label = substyleName
    ? `${GENRE_NAMES[genreId]} › ${substyleName}`
    : GENRE_NAMES[genreId]
  const tag = scope === 'lt' ? '🇱🇹' : '🌍'

  const all = candidatesFor(spec, best, aIndex, sIndex)

  // Dydis = siekiamos lubos, apkarpytos pagal realiai turimas dainas.
  // LT pusėje tai reiškia mažesnius, bet PILNUS bracket'us vietoj praleistų.
  const target = bracketSizeForStyle(genreId, scope, !!substyleName)
  const size = Math.min(target, fitBracket(all.length))
  if (size < MIN_BRACKET) {
    console.log(`  ${tag} ${label}: tik ${all.length} dainų (min ${MIN_BRACKET}) — PRALEIDŽIAM`)
    return
  }
  const songs = all.slice(0, size)
  const trimmed = size < target ? `  ⤶ sumažinta iš ${target} (turima ${all.length})` : ''

  const matches = buildBracket(songs.map(s => ({ trackId: s.trackId, views: s.views })), size)
  const auto = matches.filter(m => m.decidedBy === 'seed').length
  console.log(`  ${tag} ${label}: ${size} dainų, ${matches.length} matų (${auto} auto), balsavimas nuo rato ${voteFromRound(size)}${trimmed}`)
  console.log(`      #1: ${songs[0].artist} — ${songs[0].title} (${songs[0].views.toLocaleString('lt-LT')})`)
  console.log(`      #2: ${songs[1].artist} — ${songs[1].title} (${songs[1].views.toLocaleString('lt-LT')})`)
  if (dry) return

  const substyleId = substyleName ? sIndex.byName.get(substyleName)?.id ?? null : null
  const { data: t, error: te } = await sb.from('boombox_tournaments').insert({
    genre_id: genreId, substyle_id: substyleId, scope,
    title: label, size, vote_from_round: voteFromRound(size),
    status: 'pending', current_round: 1, sort_order: sortOrder,
  }).select('id').single()
  if (te) {
    if (te.code === '23505') { console.log(`      ⤷ jau egzistuoja — praleidžiam`); return }
    throw te
  }
  const rows = matches.map(m => ({
    tournament_id: t.id, round: m.round, slot: m.slot,
    track_a_id: m.aId, track_b_id: m.bId, winner_track_id: m.winnerId,
    decided_by: m.decidedBy, resolved_at: m.winnerId ? new Date().toISOString() : null,
  }))
  const { error: me } = await sb.from('boombox_tournament_matches').insert(rows)
  if (me) throw me
  console.log(`      ✓ turnyras #${t.id} + ${rows.length} matų`)
}

/** Sudaro visų turnyrų sąrašą: scope × stilius (× substilius, jei skaidomas). */
function buildSpecs(scope) {
  const specs = []
  for (const genreId of STYLE_POPULARITY) {
    if (splitsIntoSubstyles(genreId, scope)) {
      for (const substyleName of SPLIT_INTO_SUBSTYLES[genreId]) {
        specs.push({ genreId, scope, substyleName })
      }
    } else {
      specs.push({ genreId, scope, substyleName: null })
    }
  }
  return specs
}

async function main() {
  console.log(dry ? '— DRY RUN (į DB nerašoma) —' : '— SEEDING —')
  console.log('')
  const aIndex = await artistIndex()
  const sIndex = await substyleIndex()
  const best = await gatherBestPerArtist()

  for (const scope of scopes) {
    console.log('')
    console.log(scope === 'lt' ? '━━ LIETUVIŠKA EILĖ ━━' : '━━ PASAULIO EILĖ ━━')
    const specs = buildSpecs(scope)
    let i = 0
    for (const spec of specs) await seedOne(spec, i++, best, aIndex, sIndex)
  }
  console.log('')
  console.log('Baigta.')
}
main().catch(e => { console.error(e); process.exit(1) })
