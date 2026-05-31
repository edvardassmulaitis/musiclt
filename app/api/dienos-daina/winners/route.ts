import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '14')
  const date = searchParams.get('date')
  const supabase = createAdminClient()

  // Self-heal: užfiksuoti VISAS praėjusias dienas, kurios turi nominacijų bet
  // dar neturi laimėtojo (ne tik vakar — kad daugiadienės spragos užsipildytų
  // savaime, jei niekas nelankė puslapio). finalize_daily_winners_due() yra
  // idempotentinis ir pigus (apdoroja tik neužfiksuotas dienas).
  await supabase.rpc('finalize_daily_winners_due')

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
