import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

/**
 * Admin-only TESTAVIMO endpoint'as — paleidžia naują ciklą einamoje
 * kalendorinėje savaitėje (NE pakeičiant savaitės datos).
 *
 * SVARBU: Reset NEPILDO naujų pasiūlymų į topą! Tai admin'o sprendimas.
 * Suggestions lieka suggestions panel'e iki kol admin paspaudžia
 * "Įkelti patvirtintus" (žr. /api/top/populate).
 *
 * Reset = "start of next week marker" tik egzistuojantiems top_entries:
 *   - weeks_in_top += 1 (kiekvienas Reset = nauja savaitė tope)
 *   - is_new transition true → false (nebenauja po pirmo Reset'o)
 *   - prev_position = current position (kad trend rodikliai veiktų)
 *
 * 12-savaičių max taisyklė: prieš increment'inant, pašalinam dainas, kurios
 * jau pasiekė 12 (graduated, eina į archyvą).
 *
 * Veiksmai (eilės tvarka):
 *   1. Pašalina entries kur weeks_in_top >= 12 (graduated)
 *   2. Išvalo top_votes už šitą savaitę
 *   3. Likę entries: weeks_in_top += 1, prev_position = current position,
 *      is_new=false, total_votes=0
 *   4. Pažymi savaitę kaip nefinalizuotą (is_finalized=false, total_votes=0)
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

  // 2a. Graduation: pašalinti dainas, kurios pasiekė 12 savaičių
  const { data: graduated } = await supabase
    .from('top_entries')
    .select('id')
    .eq('week_id', week.id)
    .gte('weeks_in_top', 12)

  let graduatedCount = 0
  if (graduated && graduated.length > 0) {
    const { error: gradErr } = await supabase
      .from('top_entries')
      .delete()
      .in('id', graduated.map(g => g.id))
    if (gradErr) return NextResponse.json({ error: gradErr.message }, { status: 500 })
    graduatedCount = graduated.length
  }

  // 2b. Išvalyti visus balsus už šitą savaitę
  const { error: votesErr } = await supabase
    .from('top_votes')
    .delete()
    .eq('week_id', week.id)
  if (votesErr) return NextResponse.json({ error: votesErr.message }, { status: 500 })

  // 3. Likusiems entries'ams: weeks_in_top += 1 (žymime "nauja savaitė tope"),
  //    prev_position = current position (trend), total_votes=0, is_new=false.
  //    PALIEKAME pačią `position` reikšmę (NOT NULL constraint, nesvarbu prefinalize).
  const { data: existingEntries } = await supabase
    .from('top_entries')
    .select('id, position, weeks_in_top')
    .eq('week_id', week.id)

  if (existingEntries && existingEntries.length > 0) {
    await Promise.all(existingEntries.map(e =>
      supabase
        .from('top_entries')
        .update({
          total_votes: 0,
          prev_position: e.position,                        // CARRY OVER trend
          weeks_in_top: (e.weeks_in_top || 0) + 1,          // increment cycle
          is_new: false,                                     // jau buvo tope
        })
        .eq('id', e.id)
    ))
  }

  // 4. Atstatyti savaitės būseną — nefinalizuota, balsų skaičius 0
  //    PASTABA: Reset NEPILDO naujų pasiūlymų į topą! Tai daro tik admin
  //    rankiniu būdu per "Įkelti patvirtintus" mygtuką (/api/top/populate).
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

  const totalEntries = (existingEntries?.length || 0)

  let msg = 'Naujas ciklas paleistas.'
  if (graduatedCount > 0) msg += ` Pašalinta po 12 sav. taisyklės: ${graduatedCount}.`
  if (existingEntries?.length) msg += ` Topo dainos: ${existingEntries.length} (++weeks_in_top, prev_position trendui).`
  else msg += ' Topas tuščias — pridėk pasiūlymų ir spausk „Įkelti patvirtintus" jas pakelti į topą.'
  msg += ' Balsavimas atvertas.'

  return NextResponse.json({
    ok: true,
    message: msg,
    total: totalEntries,
    graduated: graduatedCount,
  })
}
