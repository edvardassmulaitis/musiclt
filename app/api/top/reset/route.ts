import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

/**
 * Admin-only TESTAVIMO endpoint'as — atstato einamą savaitę į pradinę
 * būseną, kad būtų galima paleisti naują pilną ciklą (populate → vote →
 * finalize) BE kalendorinės savaitės pakeitimo.
 *
 * Veiksmai:
 *   1. Pašalina visus balsus už šitą savaitę (top_votes)
 *   2. Atstato top_entries: total_votes=0, position=null, is_new=true
 *   3. Pažymi top_weeks: is_finalized=false, total_votes=0, finalized_at=null
 *
 * Topo dainos LIEKA — tik balsavimo state'as nulinamas. Jei nori išvalyti
 * ir entries — naudok "Pašalinti" mygtuką prie kiekvienos eilutės.
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

  // 1. Surasti einamą savaitę
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', top_type)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!week) return NextResponse.json({ error: 'Einamosios savaitės įrašo nėra' }, { status: 404 })

  // 2. Išvalyti visus balsus
  const { error: votesErr } = await supabase
    .from('top_votes')
    .delete()
    .eq('week_id', week.id)
  if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 })

  // 3. Atstatyti entries skaitiklius
  const { error: entriesErr } = await supabase
    .from('top_entries')
    .update({
      total_votes: 0,
      position: null,
      prev_position: null,
      peak_position: null,
      is_new: true,
      weeks_in_top: 1,
    })
    .eq('week_id', week.id)
  if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 500 })

  // 4. Atstatyti savaitės būseną — finalizuotos žymos nebėra, balsų skaičius 0
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

  return NextResponse.json({
    ok: true,
    message: 'Savaitė atstatyta. Balsai išvalyti, dainos liko. Galima testuoti dar kartą.',
  })
}
