import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

/**
 * Admin-only TESTAVIMO endpoint'as — paleidžia VISIŠKAI naują ciklą einamoje
 * kalendorinėje savaitėje (NE pakeičiant savaitės datos):
 *
 *   1. Pažymi savaitę kaip nefinalizuotą (is_finalized=false, total_votes=0)
 *   2. Pašalina visus balsus už šitą savaitę (top_votes)
 *   3. Egzistuojantiems entries'ams: position → prev_position (kad trend
 *      rodiklis (↑↓) veiktų sekančiame finalize), position=null, total_votes=0,
 *      is_new=false (jie nebenauji — buvo praeitam cikle)
 *   4. Naujus approved pasiūlymus perkelia į top_entries (is_new=true) ir
 *      pažymi pasiūlymus kaip 'used'
 *
 * Po Reset'o admin gali iš karto eiti į /top40 balsuoti — nereikia papildomai
 * spausti "Įkelti patvirtintus".
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

  // 2b. Pagal 12-savaičių taisyklę pašalinti dainas, kurios jau buvo tope
  //     daugiau nei 12 ciklų (graduated). weeks_in_top counter'is auga per
  //     kiekvieną finalize, todėl >= 12 = ji jau buvo 12 finalize ciklų.
  const { data: graduated } = await supabase
    .from('top_entries')
    .select('id, track_id')
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

  // 3. Egzistuojantiems entries'ams (po graduation): position → prev_position
  //    (kad trend rodiklis veiktų po sekančio finalize'o), total_votes=0,
  //    is_new=false. PALIEKAME position'ą tą pačią — pre-finalize sortavimas
  //    vyksta pagal total_votes, position perskaičiuojamas finalize'e.
  const { data: existingEntries } = await supabase
    .from('top_entries')
    .select('id, position')
    .eq('week_id', week.id)

  if (existingEntries && existingEntries.length > 0) {
    await Promise.all(existingEntries.map(e =>
      supabase
        .from('top_entries')
        .update({
          total_votes: 0,
          prev_position: e.position, // CARRY OVER — trend rodikliui
          // position lieka kaip buvo (NOT NULL constraint, perskaičiuos finalize)
          is_new: false, // jau buvo tope ankstesniame cikle
        })
        .eq('id', e.id)
    ))
  }

  // 4. Perkelti naujus approved pasiūlymus į top_entries
  const { data: approved } = await supabase
    .from('top_suggestions')
    .select('id, track_id')
    .eq('top_type', top_type)
    .eq('status', 'approved')
    .not('track_id', 'is', null)

  let inserted = 0
  if (approved && approved.length > 0) {
    // Patikrinti dublikatus — gali būti, kad approved daina jau ankstesniame cikle pateko į topą
    const trackIds = approved.map(s => s.track_id)
    const { data: existingForTracks } = await supabase
      .from('top_entries')
      .select('track_id')
      .eq('week_id', week.id)
      .in('track_id', trackIds)

    const existingSet = new Set((existingForTracks || []).map(e => e.track_id))
    const toInsert = approved.filter(s => !existingSet.has(s.track_id))

    if (toInsert.length > 0) {
      // Pozicijos integer'iu: tęsiame nuo egzistuojančių entries kiekio
      // (NOT NULL constraint). Pre-finalize sortavimas vyks pagal total_votes,
      // o galutinė pozicija perskaičiuojama finalize'e.
      const baseCount = existingEntries?.length || 0

      const { error: insertErr } = await supabase.from('top_entries').insert(
        toInsert.map((s, i) => ({
          week_id: week.id,
          track_id: s.track_id,
          top_type,
          position: baseCount + i + 1, // bus perskaičiuota per finalize
          total_votes: 0,
          is_new: true,                 // nauja tope
          weeks_in_top: 1,
          peak_position: baseCount + i + 1,
        }))
      )
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
      inserted = toInsert.length
    }

    // Pažymėti VISUS approved pasiūlymus kaip 'used'
    await supabase
      .from('top_suggestions')
      .update({ status: 'used' })
      .in('id', approved.map(s => s.id))
  }

  // 5. Atstatyti savaitės būseną — nefinalizuota, balsų skaičius 0
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

  const totalEntries = (existingEntries?.length || 0) + inserted

  let msg = 'Naujas ciklas paleistas.'
  if (graduatedCount > 0) msg += ` Pašalinta po 12 sav. taisyklės: ${graduatedCount}.`
  if (inserted > 0) msg += ` Pridėta naujų dainų: ${inserted}.`
  if (existingEntries?.length) msg += ` Senų dainų liko: ${existingEntries.length} (su trend istorija).`
  msg += ` Iš viso tope: ${totalEntries}. Balsavimas atvertas.`

  return NextResponse.json({
    ok: true,
    message: msg,
    total: totalEntries,
    new: inserted,
    graduated: graduatedCount,
  })
}
