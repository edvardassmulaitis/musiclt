import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

function yesterdayLT(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '14')
  const date = searchParams.get('date')
  const supabase = createAdminClient()

  // Automatiškai užfiksuoti vakarykštę jei dar nėra
  const yesterday = yesterdayLT()
  const { data: existingWinner } = await supabase
    .from('daily_song_winners')
    .select('id')
    .eq('date', yesterday)
    .maybeSingle()

  if (!existingWinner) {
    await supabase.rpc('finalize_daily_winner', { p_date: yesterday })
  }

  // Gauti nugalėtojus
  let query = supabase
    .from('daily_song_winners')
    .select(`
      id, date, total_votes, weighted_votes, winning_comment, winning_user_id,
      tracks (
        id, slug, title, cover_url, spotify_id, video_url,
        artists ( id, slug, name, cover_image_url )
      )
    `)
    .order('date', { ascending: false })

  if (date) query = query.eq('date', date)
  else query = query.limit(limit)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ winners: data || [] })
}
