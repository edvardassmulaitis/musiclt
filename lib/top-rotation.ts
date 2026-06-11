/**
 * Savaitinės topo rotacijos logika — VIENA vieta, naudojama:
 *   - /api/top/cron (šeštadienis/sekmadienis 13:00 UTC)
 *   - /api/top/weeks self-heal (jei cron'as nesuveikė, pirmas pirmadienio
 *     vizitas atlieka rotaciją)
 *
 * MODEL'IS (3 būsenos, žr. /api/top/reset komentarus):
 *   newcomer (weeks_in_top=0) → in top (1..12) → graduated (išmetama).
 *
 * Rotacija susideda iš dviejų žingsnių:
 *
 *   1. finalizeWeekTS(week) — galutinės pozicijos UŽDAROMOJE savaitėje:
 *      rank'inam pagal REGISTERED balsus (user_id IS NOT NULL, vote_type='like').
 *      Anon balsai NIEKADA neįtakoja pozicijų (anti-spam). Savaitė pažymima
 *      is_finalized=true, is_active=false. weeks_in_top NEKEIČIAM — archyvas
 *      turi rodyti būseną, kokia buvo TĄ savaitę.
 *
 *   2. carryOverToNewWeek(oldWeek, newWeek) — perkelia entries į naują savaitę
 *      su state transitions:
 *        - wit >= 12 → graduate (nekopijuojam)
 *        - newcomer (wit=0): pateko į top N → wit=1, is_new=true;
 *          nepateko → lieka newcomer wit=0, is_new=false
 *        - in top (wit>=1): wit+1, is_new=false
 *        - prev_position = finalinė pozicija senoje savaitėje
 *      Po to approved pasiūlymai → naujos newcomers, queue → 'used'.
 */

export const TOP_SIZE: Record<string, number> = {
  top40: 40,
  lt_top30: 30,
}

export type RotationStats = {
  finalized: boolean
  graduated: number
  promoted: number
  carried: number
  newcomersAdded: number
}

/** Registered balsų map'as savaitei (rank'inimui). */
async function fetchRegisteredVotes(supabase: any, weekId: number): Promise<Map<number, number>> {
  const { data: votes } = await supabase
    .from('top_votes')
    .select('track_id, user_id')
    .eq('week_id', weekId)
    .eq('vote_type', 'like')
    .not('user_id', 'is', null)
  const map = new Map<number, number>()
  ;(votes || []).forEach((v: any) => {
    map.set(v.track_id, (map.get(v.track_id) || 0) + 1)
  })
  return map
}

/**
 * Finalizuoja savaitę TS lygyje: galutinės pozicijos pagal registered balsus,
 * is_finalized=true. Idempotent — jei jau finalizuota, nieko nedaro.
 * Grąžina finalines entries (su naujomis pozicijomis) carry-over'iui.
 */
export async function finalizeWeekTS(supabase: any, week: any): Promise<any[]> {
  const { data: entries } = await supabase
    .from('top_entries')
    .select('id, track_id, position, prev_position, peak_position, weeks_in_top, top_type')
    .eq('week_id', week.id)

  if (!entries?.length) {
    if (!week.is_finalized) {
      await supabase
        .from('top_weeks')
        .update({ is_finalized: true, is_active: false, finalized_at: new Date().toISOString(), total_votes: 0 })
        .eq('id', week.id)
    }
    return []
  }

  if (week.is_finalized) return entries

  const voteMap = await fetchRegisteredVotes(supabase, week.id)

  const ranked = entries
    .map((e: any) => ({ ...e, votes: voteMap.get(e.track_id) || 0 }))
    .sort((a: any, b: any) => {
      if (b.votes !== a.votes) return b.votes - a.votes
      return (a.position || 999) - (b.position || 999)
    })

  const finals: any[] = []
  for (let i = 0; i < ranked.length; i++) {
    const e = ranked[i]
    const newPos = i + 1
    const oldPeak = e.peak_position || newPos
    const data = {
      position: newPos,
      total_votes: e.votes,
      peak_position: Math.min(oldPeak, newPos),
      // prev_position/weeks_in_top/is_new NEKEIČIAM — jie nustatyti rotacijos
      // pradžioje ir aprašo šią savaitę.
    }
    await supabase.from('top_entries').update(data).eq('id', e.id)
    finals.push({ ...e, ...data })
  }

  let totalRegistered = 0
  for (const v of voteMap.values()) totalRegistered += v

  await supabase
    .from('top_weeks')
    .update({
      is_finalized: true,
      is_active: false,
      finalized_at: new Date().toISOString(),
      total_votes: totalRegistered,
    })
    .eq('id', week.id)

  return finals
}

/**
 * Perkelia finalines entries iš senos savaitės į naują + įlieja approved
 * pasiūlymus kaip newcomers. Idempotent-ish: jei naujoje savaitėje jau yra
 * entries, kopijavimą praleidžia (tik pasiūlymus dapildo).
 */
export async function carryOverToNewWeek(
  supabase: any,
  topType: string,
  finalEntries: any[],
  newWeekId: number,
): Promise<RotationStats> {
  const topSize = TOP_SIZE[topType] || 40
  const stats: RotationStats = { finalized: true, graduated: 0, promoted: 0, carried: 0, newcomersAdded: 0 }

  const { count: existingCount } = await supabase
    .from('top_entries')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', newWeekId)

  const alreadyPopulated = (existingCount || 0) > 0

  if (!alreadyPopulated && finalEntries.length > 0) {
    const rows: any[] = []
    for (const e of finalEntries) {
      const wit = e.weeks_in_top || 0
      if (wit >= 12) { stats.graduated++; continue }

      // Legacy/migruoti entries gali turėti weeks_in_top=NULL — jei daina jau
      // turi prev_position (buvo rank'inta praeitose savaitėse), laikom ją
      // "in top", ne newcomer'iu (kitaip visas bootstrap'intas topas gautų NEW).
      const wasNewcomer = wit === 0 && e.prev_position == null
      const pos = e.position || 999
      let newWit: number
      let newIsNew: boolean
      if (wasNewcomer) {
        if (pos <= topSize) { newWit = 1; newIsNew = true; stats.promoted++ }
        else { newWit = 0; newIsNew = false }
      } else {
        newWit = wit + 1
        newIsNew = false
      }

      rows.push({
        week_id: newWeekId,
        track_id: e.track_id,
        top_type: topType,
        position: pos,
        prev_position: pos,
        peak_position: e.peak_position ?? null,
        weeks_in_top: newWit,
        is_new: newIsNew,
        total_votes: 0,
      })
    }
    if (rows.length > 0) {
      const { error } = await supabase.from('top_entries').insert(rows)
      if (error) throw new Error(`carry-over insert failed: ${error.message}`)
      stats.carried = rows.length
    }
  }

  // Approved pasiūlymai → newcomers (dedupe vs jau esamus naujos sav. entries)
  const { data: approved } = await supabase
    .from('top_suggestions')
    .select('id, track_id')
    .eq('top_type', topType)
    .eq('status', 'approved')
    .not('track_id', 'is', null)

  if (approved?.length) {
    const trackIds = approved.map((s: any) => s.track_id)
    const { data: cur } = await supabase
      .from('top_entries')
      .select('track_id')
      .eq('week_id', newWeekId)
      .in('track_id', trackIds)
    const existingSet = new Set((cur || []).map((e: any) => e.track_id))
    const toInsert = approved.filter((s: any) => !existingSet.has(s.track_id))

    if (toInsert.length > 0) {
      const { data: maxPos } = await supabase
        .from('top_entries')
        .select('position')
        .eq('week_id', newWeekId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      const startPos = (maxPos?.position || 0) + 1

      const { error } = await supabase.from('top_entries').insert(
        toInsert.map((s: any, i: number) => ({
          week_id: newWeekId,
          track_id: s.track_id,
          top_type: topType,
          position: startPos + i,
          weeks_in_top: 0,
          is_new: true,
          total_votes: 0,
          peak_position: null,
        }))
      )
      if (error) throw new Error(`suggestions insert failed: ${error.message}`)
      stats.newcomersAdded = toInsert.length
    }

    await supabase
      .from('top_suggestions')
      .update({ status: 'used' })
      .in('id', approved.map((s: any) => s.id))
  }

  return stats
}
