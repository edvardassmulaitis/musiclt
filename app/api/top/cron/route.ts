import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday, getVoteClose } from '@/lib/top-week'
import { finalizeWeekTS, carryOverToNewWeek } from '@/lib/top-rotation'
import { authorizeCron } from '@/lib/cron-auth'

/**
 * Savaitinis topo rotacijos cron'as (vercel.json: Sat 13:00 UTC + Sun 13:00 UTC).
 *
 *   lt_top30 uždaroma šeštadienį 13:00 UTC
 *   top40    uždaroma sekmadienį 13:00 UTC
 *
 * Kiekvienam top tipui:
 *   1. Randa einamosios kalendorinės savaitės įrašą.
 *   2. Jei vote_close DAR NEPRAĖJO — praleidžia (pvz. šeštadienio run'as
 *      neliečia top40, kuris uždaromas tik sekmadienį).
 *   3. Finalizuoja: galutinės pozicijos pagal REGISTERED balsus (TS lygiu,
 *      žr. lib/top-rotation.ts — anon balsai pozicijų NEĮTAKOJA).
 *   4. Sukuria kitos savaitės įrašą (is_active=true).
 *   5. Perkelia entries su state transitions (graduate 12 sav., newcomer→top,
 *      wit++) + approved pasiūlymai tampa newcomers.
 *   6. Išvalo užstrigusias is_active=true senas savaites.
 *
 * Vercel automatiškai siunčia Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: Request) {
  // authorizeCron fail-closed'ina jei CRON_SECRET nenustatytas (buvo: `Bearer undefined`
  // praeidavo, jei env tuščias).
  if (!authorizeCron(req))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = new Date()
  const thisMonday = getCurrentWeekMonday(now)
  const results: Record<string, string> = {}

  for (const topType of ['top40', 'lt_top30']) {
    try {
      // 1. Einamosios kalendorinės savaitės įrašas (anchor — week_start)
      const { data: week } = await supabase
        .from('top_weeks')
        .select('*')
        .eq('top_type', topType)
        .eq('week_start', thisMonday)
        .maybeSingle()

      if (!week) {
        results[topType] = 'no current week row — skipping (self-heal sukurs)'
        continue
      }

      // 2. Ar jau laikas uždaryti? (Sat run'as top40 neliečia)
      const closeAt = week.vote_close || getVoteClose(topType, week.week_start)
      if (new Date(closeAt).getTime() > now.getTime()) {
        results[topType] = `not due yet (closes ${closeAt})`
        continue
      }

      // 3. Finalizuoti (idempotent — jei jau finalizuota, grąžina esamas entries)
      const finals = await finalizeWeekTS(supabase, week)

      // 4. Kitos savaitės įrašas
      const nextMonday = new Date(week.week_start + 'T00:00:00Z')
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7)
      const nextMondayStr = nextMonday.toISOString().split('T')[0]

      let { data: nextWeek } = await supabase
        .from('top_weeks')
        .select('*')
        .eq('top_type', topType)
        .eq('week_start', nextMondayStr)
        .maybeSingle()

      if (!nextWeek) {
        const { data: created, error: createErr } = await supabase
          .from('top_weeks')
          .insert({
            top_type: topType,
            week_start: nextMondayStr,
            vote_open: now.toISOString(),
            vote_close: getVoteClose(topType, nextMondayStr),
            is_active: true,
            is_finalized: false,
            total_votes: 0,
          })
          .select()
          .single()
        if (createErr) throw new Error(`next week create failed: ${createErr.message}`)
        nextWeek = created
      }

      // 5. Carry-over + approved pasiūlymai
      const stats = await carryOverToNewWeek(supabase, topType, finals, nextWeek.id)

      // 6. Užstrigusių is_active cleanup (visos kitos savaitės → false)
      await supabase
        .from('top_weeks')
        .update({ is_active: false })
        .eq('top_type', topType)
        .eq('is_active', true)
        .neq('id', nextWeek.id)

      results[topType] =
        `finalized week ${week.week_start} (${finals.length} entries) → ${nextMondayStr}: ` +
        `carried ${stats.carried}, graduated ${stats.graduated}, promoted ${stats.promoted}, ` +
        `+${stats.newcomersAdded} iš pasiūlymų`
    } catch (err: any) {
      results[topType] = `error: ${err.message}`
    }
  }

  return NextResponse.json({ ok: true, results, timestamp: now.toISOString() })
}
