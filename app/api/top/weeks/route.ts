import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function getVoteClose(topType: string, mondayStr: string): string {
  const monday = new Date(mondayStr + 'T00:00:00')
  if (topType === 'lt_top30') {
    // Šeštadienis 15:00 Vilnius ≈ 13:00 UTC
    const sat = new Date(monday)
    sat.setDate(sat.getDate() + 5)
    sat.setUTCHours(13, 0, 0, 0)
    return sat.toISOString()
  } else {
    // Sekmadienis 15:00 Vilnius ≈ 13:00 UTC
    const sun = new Date(monday)
    sun.setDate(sun.getDate() + 6)
    sun.setUTCHours(13, 0, 0, 0)
    return sun.toISOString()
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const supabase = createAdminClient()

  const thisMonday = getMondayOf(new Date())

  // Patikrinti ar šios savaitės įrašas jau egzistuoja
  const { data: existing } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', topType)
    .eq('week_start', thisMonday)
    .maybeSingle()

  if (!existing) {
    // Deaktyvuoti senąją savaitę
    await supabase
      .from('top_weeks')
      .update({ is_active: false })
      .eq('top_type', topType)
      .eq('is_active', true)

    const voteClose = getVoteClose(topType, thisMonday)

    // Sukurti naują savaitę
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

    // Perkelti approved pasiūlymus į naują savaitę
    if (newWeek) {
      const { data: approved } = await supabase
        .from('top_suggestions')
        .select('track_id')
        .eq('top_type', topType)
        .eq('status', 'approved')

      if (approved && approved.length > 0) {
        const entries = approved.map((s, i) => ({
          week_id: newWeek.id,
          track_id: s.track_id,
          top_type: topType,
          position: i + 1,
          total_votes: 0,
          is_new: true,
          weeks_in_top: 1,
          peak_position: i + 1,
        }))

        await supabase.from('top_entries').insert(entries)

        // Pažymėti kaip 'used'
        await supabase
          .from('top_suggestions')
          .update({ status: 'used' })
          .eq('top_type', topType)
          .eq('status', 'approved')
      }
    }
  }

  const { data, error } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('top_type', topType)
    .order('week_start', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ weeks: data || [] })
}
