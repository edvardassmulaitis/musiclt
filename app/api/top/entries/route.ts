import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const weekId = searchParams.get('week_id')
  const supabase = createAdminClient()

  // Rasti aktyvią savaitę jei week_id nenurodytas
  let targetWeekId = weekId ? parseInt(weekId) : null
  if (!targetWeekId) {
    const { data: week } = await supabase
      .from('top_weeks')
      .select('id')
      .eq('top_type', topType)
      .eq('is_active', true)
      .single()
    targetWeekId = week?.id ?? null
  }

  if (!targetWeekId)
    return NextResponse.json({ entries: [], week: null })

  const { data: week } = await supabase
    .from('top_weeks').select('*').eq('id', targetWeekId).single()

  const { data: entries, error } = await supabase
    .from('top_entries')
    .select(`
      id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position,
      tracks (
        id, slug, title, cover_url,
        artists ( id, slug, name, cover_image_url )
      )
    `)
    .eq('week_id', targetWeekId)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: entries || [], week })
}

// Admin: pridėti dainą į TOP
export async function POST(req: Request) {
  const { getServerSession } = await import('next-auth')
  const { authOptions } = await import('@/lib/auth')
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin','super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { week_id, track_id, position } = body
  const supabase = createAdminClient()

  const { data: week } = await supabase
    .from('top_weeks').select('top_type').eq('id', week_id).single()

  const { data, error } = await supabase
    .from('top_entries')
    .upsert({ week_id, track_id, position, top_type: week?.top_type || 'top40', weeks_in_top: 1, total_votes: 0, is_new: true, peak_position: position })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
