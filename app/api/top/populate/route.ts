import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

/**
 * Admin-only mid-cycle force-promote endpoint'as testavimui.
 *
 * Naudojamas tada, kai admin'as nori IŠ KARTO permesti suggestions queue
 * į newcomers (be cycle rotation). Pasiūlymai tampa newcomers (weeks_in_top=0,
 * is_new=true) ir jau dalyvauja balsavime.
 *
 * Skirtumas nuo Reset:
 *   - Reset = pilna cycle rotation (state transition + suggestions → newcomers)
 *   - Populate = TIK suggestions → newcomers (be state transition).
 *     Naudinga, kai admin'as nori pridėti newcomer'į vidury savaitės.
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

  // 1. Surasti dabartinės kalendorinės savaitės įrašą
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id, is_finalized')
    .eq('top_type', top_type)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!week) return NextResponse.json({ error: 'Einamosios savaitės įrašo nėra' }, { status: 404 })
  if (week.is_finalized) return NextResponse.json({ error: 'Savaitė jau finalizuota — naudok „Atstatyti"' }, { status: 400 })

  // 2. Surinkti patvirtintus pasiūlymus
  const { data: approved } = await supabase
    .from('top_suggestions')
    .select('id, track_id')
    .eq('top_type', top_type)
    .eq('status', 'approved')
    .not('track_id', 'is', null)

  if (!approved?.length) return NextResponse.json({ inserted: 0, message: 'Patvirtintų pasiūlymų nėra' })

  // 3. Patikrinti kas jau yra topas (kad neduplikuotume)
  const trackIds = approved.map(s => s.track_id)
  const { data: existing } = await supabase
    .from('top_entries')
    .select('track_id')
    .eq('week_id', week.id)
    .in('track_id', trackIds)

  const existingSet = new Set((existing || []).map(e => e.track_id))
  const toInsert = approved.filter(s => !existingSet.has(s.track_id))

  // 4. Suskaičiuoti dabartinį positions offset'ą
  const { count: existingCount } = await supabase
    .from('top_entries')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week.id)

  const baseCount = existingCount || 0

  if (toInsert.length > 0) {
    const rows = toInsert.map((s, i) => ({
      week_id: week.id,
      track_id: s.track_id,
      top_type,
      position: baseCount + i + 1,
      total_votes: 0,
      is_new: true,
      weeks_in_top: 0,                    // NEWCOMER (ne iš karto į topą)
      peak_position: null,
    }))

    const { error: insertErr } = await supabase.from('top_entries').insert(rows)
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 5. Pažymėti VISUS approved pasiūlymus kaip 'used' (net jei jau buvo tope)
  await supabase
    .from('top_suggestions')
    .update({ status: 'used' })
    .in('id', approved.map(s => s.id))

  return NextResponse.json({
    inserted: toInsert.length,
    message: toInsert.length > 0
      ? `Pridėta ${toInsert.length} naujienų (newcomers, 0/12). Pasiūlymai pažymėti kaip 'used'.`
      : 'Visi patvirtinti jau buvo naujienose. Pasiūlymai pažymėti kaip used.',
  })
}
