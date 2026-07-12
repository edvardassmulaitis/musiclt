// lib/tournament-resolver.ts
//
// Turnyrų gyvavimo ciklas (kviečia /api/cron/turnyrai, kelis kartus per parą —
// visi žingsniai idempotentiški):
//
//   1. RESOLVE — vakarykščių (ir senesnių) turnyro dvikovų balsų suvedimas:
//      daugumos balsas → winner_track_id (decided_by='vote'), lygiosios arba
//      0 balsų → laimi populiaresnė pagal YT peržiūras (aukštesnis seed'as).
//      Nugalėtojas perkeliamas į kito rato matą (slot/2, pusė pagal slot%2).
//      Finalas → čempionas, status='done', aktyvuojamas kitas eilės turnyras.
//
//   2. PUBLISH — šiandienos scope (scopeOfDay: lyginė para LT, nelyginė —
//      pasaulis) aktyvaus turnyro kitas matas paskelbiamas kaip dienos dvikova:
//      sukuriamas boombox_duel_drops įrašas (matchup_type='tournament',
//      published_at=now) — dienos iššūkio pickTodayQueued jį pasiima kaip
//      šiandienos drop'ą.

import type { SupabaseClient } from '@supabase/supabase-js'
import { scopeOfDay, roundsCount, type Scope } from './tournament'
import { todayLT, ltDayStartUtc, nextDayLT } from './boombox'

type MatchRow = {
  id: number; tournament_id: number; round: number; slot: number
  track_a_id: number | null; track_b_id: number | null
  winner_track_id: number | null; duel_drop_id: number | null
}

async function pageAll(build: () => any, orderBy: string[]): Promise<any[]> {
  const out: any[] = []
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

/** Balsų suvedimas vienam duel drop'ui: { A: n, B: n }. */
async function countVotes(sb: SupabaseClient, duelDropId: number): Promise<{ A: number; B: number }> {
  const rows = await pageAll(
    () => sb.from('boombox_completions')
      .select('payload')
      .eq('drop_table', 'boombox_duel_drops')
      .eq('drop_id', duelDropId),
    ['id'],
  )
  const out = { A: 0, B: 0 }
  for (const r of rows) {
    const c = r?.payload?.choice
    if (c === 'A') out.A++
    else if (c === 'B') out.B++
  }
  return out
}

/**
 * 1. RESOLVE — suvedami visi turnyro matai, kurių dvikovos diena jau praėjo
 * (drop published_at < šiandienos LT paros pradžia), o nugalėtojo dar nėra.
 */
export async function resolveFinishedDuels(sb: SupabaseClient): Promise<{
  resolved: Array<{ matchId: number; winner: number; votes: { A: number; B: number } }>
  champions: Array<{ tournamentId: number; title: string; champion: number }>
}> {
  const todayStart = ltDayStartUtc(todayLT())
  const resolved: Array<{ matchId: number; winner: number; votes: { A: number; B: number } }> = []
  const champions: Array<{ tournamentId: number; title: string; champion: number }> = []

  const { data: pending, error } = await sb
    .from('boombox_tournament_matches')
    .select('id,tournament_id,round,slot,track_a_id,track_b_id,winner_track_id,duel_drop_id,duel:duel_drop_id(published_at)')
    .is('winner_track_id', null)
    .not('duel_drop_id', 'is', null)
  if (error) throw error

  for (const m of (pending ?? []) as any[]) {
    const publishedAt = Array.isArray(m.duel) ? m.duel[0]?.published_at : m.duel?.published_at
    if (!publishedAt || publishedAt >= todayStart) continue  // dar šiandien gyvas
    if (!m.track_a_id || !m.track_b_id) continue

    const votes = await countVotes(sb, m.duel_drop_id)
    let winner: number
    if (votes.A > votes.B) winner = m.track_a_id
    else if (votes.B > votes.A) winner = m.track_b_id
    else {
      // Lygiosios / 0 balsų → laimi populiaresnė pagal YT (aukštesnis seed'as)
      const { data: ts } = await sb.from('tracks').select('id,video_views').in('id', [m.track_a_id, m.track_b_id])
      const va = ts?.find(t => t.id === m.track_a_id)?.video_views ?? 0
      const vb = ts?.find(t => t.id === m.track_b_id)?.video_views ?? 0
      winner = va >= vb ? m.track_a_id : m.track_b_id
    }

    const { error: ue } = await sb.from('boombox_tournament_matches')
      .update({ winner_track_id: winner, decided_by: 'vote', resolved_at: new Date().toISOString() })
      .eq('id', m.id).is('winner_track_id', null)  // idempotencija (lenktynės)
    if (ue) throw ue
    resolved.push({ matchId: m.id, winner, votes })

    // Perkeliam nugalėtoją į kitą ratą (arba — finalas → čempionas)
    const { data: t } = await sb.from('boombox_tournaments')
      .select('id,title,scope,size,sort_order').eq('id', m.tournament_id).single()
    const totalRounds = roundsCount(t!.size)

    if (m.round >= totalRounds) {
      // FINALAS → čempionas, kitas turnyras eilėje
      await sb.from('boombox_tournaments')
        .update({ status: 'done', champion_track_id: winner, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', m.tournament_id)
      champions.push({ tournamentId: m.tournament_id, title: t!.title, champion: winner })

      const { data: next } = await sb.from('boombox_tournaments')
        .select('id,title').eq('scope', t!.scope).eq('status', 'pending')
        .order('sort_order').limit(1).maybeSingle()
      if (next) {
        await sb.from('boombox_tournaments')
          .update({ status: 'active', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', next.id)
      }
    } else {
      const nextSlot = Math.floor(m.slot / 2)
      const side = m.slot % 2 === 0 ? 'track_a_id' : 'track_b_id'
      const { error: pe } = await sb.from('boombox_tournament_matches')
        .update({ [side]: winner })
        .eq('tournament_id', m.tournament_id).eq('round', m.round + 1).eq('slot', nextSlot)
        .is(side, null)  // idempotencija — neperrašom jau įdėto
      if (pe) throw pe
    }
  }

  return { resolved, champions }
}

/**
 * 2. PUBLISH — šiandienos scope aktyvaus turnyro kitas matas → dienos dvikova.
 * Idempotentiška: jei šiandien turnyro dvikova jau paskelbta — nieko nedaro.
 */
export async function publishTodayDuel(sb: SupabaseClient): Promise<
  { published: false; reason: string } |
  { published: true; matchId: number; duelDropId: number; tournament: string; round: number }
> {
  const scope: Scope = scopeOfDay()
  const today = todayLT()
  const dayStart = ltDayStartUtc(today)
  const dayEnd = ltDayStartUtc(nextDayLT(today))

  // Aktyvus šio scope turnyras (jei nėra — bandome aktyvuoti pirmą eilėje)
  let { data: t } = await sb.from('boombox_tournaments')
    .select('id,title,size,current_round').eq('scope', scope).eq('status', 'active').maybeSingle()
  if (!t) {
    const { data: next } = await sb.from('boombox_tournaments')
      .select('id,title,size,current_round').eq('scope', scope).eq('status', 'pending')
      .order('sort_order').limit(1).maybeSingle()
    if (!next) return { published: false, reason: `nėra aktyvaus ${scope} turnyro (visi baigti?)` }
    await sb.from('boombox_tournaments')
      .update({ status: 'active', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', next.id)
    t = next
  }

  // Ar šio scope turnyro dvikova šiandien jau paskelbta? (idempotencija)
  const { data: todays } = await sb
    .from('boombox_tournament_matches')
    .select('id,duel:duel_drop_id(published_at)')
    .eq('tournament_id', t.id)
    .not('duel_drop_id', 'is', null)
  for (const m of (todays ?? []) as any[]) {
    const p = Array.isArray(m.duel) ? m.duel[0]?.published_at : m.duel?.published_at
    if (p && p >= dayStart && p < dayEnd) {
      return { published: false, reason: `šiandienos ${scope} dvikova jau paskelbta (match #${m.id})` }
    }
  }

  // Kitas matas: mažiausias ratas/slot'as be nugalėtojo, su abiem dalyviais
  const { data: ms, error: me } = await sb
    .from('boombox_tournament_matches')
    .select('id,round,slot,track_a_id,track_b_id,winner_track_id,duel_drop_id')
    .eq('tournament_id', t.id)
    .is('winner_track_id', null)
    .order('round').order('slot')
  if (me) throw me
  const next = (ms ?? []).find(m => m.track_a_id && m.track_b_id && !m.duel_drop_id)
  if (!next) return { published: false, reason: `turnyre „${t.title}" nėra paruošto mato (laukiama resolve?)` }

  // Dienos dvikovos drop'as — published_at=now, kad pickTodayQueued pasiimtų
  const { data: drop, error: de } = await sb.from('boombox_duel_drops')
    .insert({
      matchup_type: 'tournament',
      track_a_id: next.track_a_id,
      track_b_id: next.track_b_id,
      status: 'ready',
      published_at: new Date().toISOString(),
      sort_order: 0,
    })
    .select('id').single()
  if (de) throw de

  const { error: le } = await sb.from('boombox_tournament_matches')
    .update({ duel_drop_id: drop.id, published_at: new Date().toISOString() })
    .eq('id', next.id)
  if (le) throw le

  await sb.from('boombox_tournaments')
    .update({ current_round: next.round, updated_at: new Date().toISOString() })
    .eq('id', t.id)

  return { published: true, matchId: next.id, duelDropId: drop.id, tournament: t.title, round: next.round }
}
