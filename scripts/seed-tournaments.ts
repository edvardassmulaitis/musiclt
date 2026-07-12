#!/usr/bin/env node
// @ts-nocheck — utility skriptas, vykdomas per tsx (ne build'e)
/**
 * Dainų „playoffs" seed'as v3 — dvi eilės (LT/pasaulis), kuruoti pogrupiai,
 * VISI ratai balsuojami (auto-ratų nebėra).
 *
 * Naudojimas:
 *   npx tsx scripts/seed-tournaments.ts --dry              # tik atspausdina
 *   npx tsx scripts/seed-tournaments.ts --scope lt --dry   # tik LT eilė
 *   npx tsx scripts/seed-tournaments.ts                    # seed'ina abi eiles
 *
 * Reikia .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Reikia migracijų iki 20260712b_tournaments_groups_vote_all.sql imtinai.
 *
 * Idempotencija: DB unique indeksas (scope, genre_id, group_key) — pakartotinis
 * paleidimas dublikatų nesukurs (23505 → praleidžiam).
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  STYLE_POPULARITY, SCOPES, GENRE_NAMES, groupsForStyle,
  fitBracket, buildBracket, voteFromRound, MIN_BRACKET,
} from '../lib/tournament'
import { candidatesForSpec } from '../lib/tournament-db'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const onlyScope = args.includes('--scope') ? args[args.indexOf('--scope') + 1] : null
const scopes = onlyScope ? [onlyScope] : SCOPES

async function seedOne(spec, sortOrder) {
  const { genreId, scope, group } = spec
  const isSplit = groupsForStyle(genreId, scope).length > 1
  const label = isSplit ? `${GENRE_NAMES[genreId]} › ${group.label}` : GENRE_NAMES[genreId]
  const tag = scope === 'lt' ? '🇱🇹' : '🌍'

  const all = await candidatesForSpec(sb, spec)
  const size = Math.min(group.target, fitBracket(all.length))
  if (size < MIN_BRACKET) {
    console.log(`  ${tag} ${label}: tik ${all.length} dainų (min ${MIN_BRACKET}) — PRALEIDŽIAM`)
    return
  }
  const songs = all.slice(0, size)
  const trimmed = size < group.target ? `  ⤶ sumažinta iš ${group.target} (turima ${all.length})` : ''

  const matches = buildBracket(songs.map(s => ({ trackId: s.trackId, views: s.views })), size)
  console.log(`  ${tag} ${label}: ${size} dainų, ${matches.length} matų — VISI balsuojami${trimmed}`)
  console.log(`      #1: ${songs[0].artist} — ${songs[0].title} (${songs[0].views.toLocaleString('lt-LT')})`)
  console.log(`      #2: ${songs[1].artist} — ${songs[1].title} (${songs[1].views.toLocaleString('lt-LT')})`)
  if (dry) return

  const { data: t, error: te } = await sb.from('boombox_tournaments').insert({
    genre_id: genreId, substyle_id: null, scope, group_key: group.key,
    title: label, size, vote_from_round: voteFromRound(size),
    status: 'pending', current_round: 1, sort_order: sortOrder,
  }).select('id').single()
  if (te) {
    if (te.code === '23505') { console.log(`      ⤷ jau egzistuoja — praleidžiam`); return }
    throw te
  }
  const rows = matches.map(m => ({
    tournament_id: t.id, round: m.round, slot: m.slot,
    track_a_id: m.aId, track_b_id: m.bId, winner_track_id: null, decided_by: null,
  }))
  const { error: me } = await sb.from('boombox_tournament_matches').insert(rows)
  if (me) throw me
  console.log(`      ✓ turnyras #${t.id} + ${rows.length} matų`)
}

function buildSpecs(scope) {
  const specs = []
  for (const genreId of STYLE_POPULARITY) {
    for (const group of groupsForStyle(genreId, scope)) {
      specs.push({ genreId, scope, group })
    }
  }
  return specs
}

async function main() {
  console.log(dry ? '— DRY RUN (į DB nerašoma) —' : '— SEEDING —')
  for (const scope of scopes) {
    console.log('')
    console.log(scope === 'lt' ? '━━ LIETUVIŠKA EILĖ ━━' : '━━ PASAULIO EILĖ ━━')
    const specs = buildSpecs(scope)
    let i = 0
    for (const spec of specs) await seedOne(spec, i++)
  }
  // Aktyvuojam pirmą kiekvieno scope turnyrą (jei dar nė vieno aktyvaus)
  if (!dry) {
    for (const scope of scopes) {
      const { data: act } = await sb.from('boombox_tournaments').select('id').eq('scope', scope).eq('status', 'active').maybeSingle()
      if (act) continue
      const { data: first } = await sb.from('boombox_tournaments')
        .select('id,title').eq('scope', scope).eq('status', 'pending')
        .order('sort_order').limit(1).maybeSingle()
      if (first) {
        await sb.from('boombox_tournaments').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', first.id)
        console.log(`  ▶ aktyvuotas ${scope}: ${first.title}`)
      }
    }
  }
  console.log('')
  console.log('Baigta.')
}
main().catch(e => { console.error(e); process.exit(1) })
