import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getCurrentWeekMonday, getVoteClose } from '@/lib/top-week'
import { finalizeWeekTS, carryOverToNewWeek } from '@/lib/top-rotation'

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
      // Self-heal rotacija (jei cron'as nesuveikė): finalizuoti praeitą
      // savaitę + perkelti entries su state transitions + approved
      // pasiūlymai → newcomers. Visa logika lib/top-rotation.ts (ta pati,
      // kurią naudoja cron'as).
      try {
        // Look-back: naujausia praeita savaitė, kuri TURI entries (tarpinės
        // tuščios savaitės — pvz. cron'o sukurtos be carry-over — praleidžiamos,
        // kad topas neišnyktų po vienos „blogos" savaitės).
        const { data: prevWeeks } = await supabase
          .from('top_weeks')
          .select('*')
          .eq('top_type', topType)
          .lt('week_start', thisMonday)
          .order('week_start', { ascending: false })
          .limit(10)

        let prevWeek: any = null
        for (const w of (prevWeeks || [])) {
          const { count } = await supabase
            .from('top_entries')
            .select('id', { count: 'exact', head: true })
            .eq('week_id', w.id)
          if ((count || 0) > 0) { prevWeek = w; break }
        }

        const finals = prevWeek ? await finalizeWeekTS(supabase, prevWeek) : []
        await carryOverToNewWeek(supabase, topType, finals, newWeek.id)

        // Užstrigusių is_active cleanup
        await supabase
          .from('top_weeks')
          .update({ is_active: false })
          .eq('top_type', topType)
          .eq('is_active', true)
          .neq('id', newWeek.id)
      } catch {
        // Self-heal neturi nuversti GET'o — rotaciją pakartos cron'as.
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
