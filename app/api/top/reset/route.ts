import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

const TOP_SIZE: Record<string, number> = {
  top40: 40,
  lt_top30: 30,
}

/**
 * Cycle rotation endpoint — emuliuoja pirmadienio cron'ą testavimui.
 *
 * MODEL'IS (3 būsenos top_entries lentelėje):
 *
 *   1. **Newcomer** (weeks_in_top = 0) — daina ką tik atėjo iš
 *      suggestions queue. Dalyvauja balsavime, bet dar NĖRA topo dalis.
 *      UI: "Naujienos" panel'is sone po player'iu.
 *
 *   2. **In top** (weeks_in_top >= 1, position <= TOP_SIZE) — daina yra
 *      pagrindinia me top 40/30. Skaičiuojamas cikIai, max 12 savaičių.
 *
 *   3. **Below top / iškritusi** (weeks_in_top >= 1, position > TOP_SIZE) —
 *      daina anksčiau buvo tope, bet šią savaitę nepateko. Lieka matoma
 *      žemiau, dimmed UI'e. Kitą ciklą gali grįžti į top, jei užtektinai balsų.
 *
 * Cycle rotation veiksmai:
 *
 *   1. Egzistuojantys entries → state transition pagal CURRENT poziciją:
 *      - Newcomer (wit=0): jei pozicija <= TOP_SIZE → tampa "in top" (wit=1).
 *        Jei ne — lieka newcomer (wit=0) dar vienam ciklui.
 *      - In top (wit >= 1): jei wit >= 12 → graduate (delete archyvui).
 *        Kitaip: wit += 1.
 *      - prev_position = current position (trend rodikliui).
 *      - total_votes = 0 (naujas balsavimas).
 *      - is_new = false (nebenauja).
 *
 *   2. Suggestions queue (top_suggestions, status='approved') →
 *      naujos newcomers (wit=0, is_new=true). Queue išsivalo (status='used').
 *
 *   3. top_votes išvalomi šiai savaitei.
 *
 *   4. Savaitė atrakinama (is_finalized=false, total_votes=0).
 *
 * Body: { top_type: 'top40' | 'lt_top30' }
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { top_type } = await req.json()
  if (top_type !== 'top40' && top_type !== 'lt_top30')
    return NextResponse.json({ error: 'Bad top_type' }, { status: 400 })

  const supabase = createAdminClient()
  const thisMonday = getCurrentWeekMonday()
  const topSize = TOP_SIZE[top_type]

  // 1. Surasti einamą savaitę
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', top_type)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!week) return NextResponse.json({ error: 'Einamosios savaitės įrašo nėra' }, { status: 404 })

  // 2. Egzistuojantys entries — state transitions
  const { data: existingEntries } = await supabase
    .from('top_entries')
    .select('id, position, weeks_in_top')
    .eq('week_id', week.id)

  let graduatedCount = 0
  let promotedCount = 0   // newcomer → in top
  let stayedNewcomer = 0  // newcomer didn't make top
  let stayedInTop = 0     // already in top, weeks++

  if (existingEntries && existingEntries.length > 0) {
    const toDelete: number[] = []
    const updates: Array<{ id: number; data: any }> = []

    for (const e of existingEntries) {
      const wit = e.weeks_in_top || 0
      const pos = e.position || 999

      if (wit >= 12) {
        // Graduate
        toDelete.push(e.id)
        graduatedCount++
        continue
      }

      if (wit === 0) {
        // Newcomer — did it make top?
        if (pos <= topSize) {
          // Promoted to in-top
          updates.push({
            id: e.id,
            data: {
              weeks_in_top: 1,
              prev_position: pos,
              total_votes: 0,
              is_new: false,
            },
          })
          promotedCount++
        } else {
          // Stay newcomer for another cycle
          updates.push({
            id: e.id,
            data: {
              weeks_in_top: 0,
              prev_position: pos,
              total_votes: 0,
              is_new: false,
            },
          })
          stayedNewcomer++
        }
      } else {
        // In top — increment cycle
        updates.push({
          id: e.id,
          data: {
            weeks_in_top: wit + 1,
            prev_position: pos,
            total_votes: 0,
            is_new: false,
          },
        })
        stayedInTop++
      }
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from('top_entries').delete().in('id', toDelete)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (updates.length > 0) {
      await Promise.all(updates.map(u =>
        supabase.from('top_entries').update(u.data).eq('id', u.id)
      ))
    }
  }

  // 3. Išvalyti balsus už šitą savaitę
  const { error: votesErr } = await supabase
    .from('top_votes')
    .delete()
    .eq('week_id', week.id)
  if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 })

  // 4. Suggestions queue → naujos newcomers
  const { data: approved } = await supabase
    .from('top_suggestions')
    .select('id, track_id')
    .eq('top_type', top_type)
    .eq('status', 'approved')
    .not('track_id', 'is', null)

  let newComersAdded = 0
  if (approved && approved.length > 0) {
    // Dedup vs current entries
    const trackIds = approved.map(s => s.track_id)
    const { data: currentEntries } = await supabase
      .from('top_entries')
      .select('track_id')
      .eq('week_id', week.id)
      .in('track_id', trackIds)

    const existingSet = new Set((currentEntries || []).map(e => e.track_id))
    const toInsert = approved.filter(s => !existingSet.has(s.track_id))

    // Įdedame newcomers su pozicijomis ANT VIRŠAUS (high integers, NOT NULL)
    // Po finalize'o pozicijos perskaičiuos pagal balsus.
    const { data: maxPos } = await supabase
      .from('top_entries')
      .select('position')
      .eq('week_id', week.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const startPos = (maxPos?.position || 0) + 1

    if (toInsert.length > 0) {
      const { error } = await supabase.from('top_entries').insert(
        toInsert.map((s, i) => ({
          week_id: week.id,
          track_id: s.track_id,
          top_type,
          position: startPos + i,    // Default — bus perskaičiuota finalize
          weeks_in_top: 0,           // Newcomer!
          is_new: true,
          total_votes: 0,
          peak_position: null,
        }))
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      newComersAdded = toInsert.length
    }

    // Suggestions queue išsivalo
    await supabase
      .from('top_suggestions')
      .update({ status: 'used' })
      .in('id', approved.map(s => s.id))
  }

  // 5. Atrakinti savaitę
  const { error: weekErr } = await supabase
    .from('top_weeks')
    .update({
      is_finalized: false,
      is_active: true,
      finalized_at: null,
      total_votes: 0,
    })
    .eq('id', week.id)
  if (weekErr) return NextResponse.json({ error: weekErr.message }, { status: 500 })

  const totalNewcomers = stayedNewcomer + newComersAdded
  const totalInTop = promotedCount + stayedInTop

  let msg = `Naujas ciklas paleistas (${top_type}, top ${topSize}).`
  if (graduatedCount > 0) msg += ` Graduated (12sav.): ${graduatedCount}.`
  if (promotedCount > 0) msg += ` Naujienos pateko į topą: ${promotedCount}.`
  if (newComersAdded > 0) msg += ` Naujos naujienos iš pasiūlymų: ${newComersAdded}.`
  msg += ` Iš viso: ${totalNewcomers} naujienų + ${totalInTop} tope. Balsavimas atvertas.`

  return NextResponse.json({
    ok: true,
    message: msg,
    graduated: graduatedCount,
    promoted: promotedCount,
    newcomers_added: newComersAdded,
    newcomers_total: totalNewcomers,
    in_top_total: totalInTop,
  })
}
