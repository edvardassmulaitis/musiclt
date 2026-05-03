import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday, getVoteClose } from '@/lib/top-week'

/**
 * Self-heal anchor: visada nustato dabartinę kalendorinę savaitę kaip
 * topas savaitę. Jei DB neturi įrašo einamai savaitei — kuriam.
 *
 * NE kuriame ateities savaičių! Anchor'as yra `getCurrentWeekMonday()`,
 * pagal kurį visa logika sukasi:
 *   - thisMonday = einamosios savaitės pirmadienis (jei sekmadienis,
 *     atsisukame į praėjusį pirmadienį — Mon-Sun savaitė).
 *   - Surandame įrašą week_start = thisMonday.
 *   - Jei nėra: kuriame su is_active=true, perkeliame approved pasiūlymus.
 *   - Jei yra: PALIEKAME RAMYBĖJE (ne keičiame is_active/is_finalized).
 *
 * Kron'o vaidmuo: sekmadienį/šeštadienį finalizuoja einamą savaitę. Naują
 * savaitę kuria PIRMADIENĮ (kai calendar pereina). Jei kron'as nesukūrė —
 * šis self-heal sukurs vos tik admin/lankytojas atidaro topas puslapį.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const supabase = createAdminClient()

  const thisMonday = getCurrentWeekMonday()

  const { data: existing } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!existing) {
    const voteClose = getVoteClose(topType, thisMonday)

    const { data: newWeek } = await supabase
      .from('top_weeks')
      .insert({
        top_type: topType,
        week_start: thisMonday,
        vote_open: new Date().toISOString(),
        vote_close: voteClose,
        is_active: true,
        is_finalized: false,
        total_votes: 0,
      })
      .select()
      .single()

    if (newWeek) {
      // Perkelti approved pasiūlymus į naujos savaitės top_entries
      const { data: approved } = await supabase
        .from('top_suggestions')
        .select('id, track_id')
        .eq('top_type', topType)
        .eq('status', 'approved')
        .not('track_id', 'is', null)

      if (approved && approved.length > 0) {
        await supabase.from('top_entries').insert(
          approved.map((s, i) => ({
            week_id: newWeek.id,
            track_id: s.track_id,
            top_type: topType,
            position: i + 1,
            total_votes: 0,
            is_new: true,
            weeks_in_top: 1,
            peak_position: i + 1,
          }))
        )

        await supabase
          .from('top_suggestions')
          .update({ status: 'used' })
          .in('id', approved.map(s => s.id))
      }
    }
  }

  // Grąžinti savaičių sąrašą (visada — tiek po self-heal, tiek be jo)
  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data || [] })
}
