import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const weekId = searchParams.get('week_id')
  const supabase = createAdminClient()

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
    .from('top_weeks')
    .select('*')
    .eq('id', targetWeekId)
    .single()

  // Pirma gauname entries
  const { data: entries, error } = await supabase
    .from('top_entries')
    .select('id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id')
    .eq('week_id', targetWeekId)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries || entries.length === 0)
    return NextResponse.json({ entries: [], week })

  // Atskirai gauname tracks su atlikėjais
  const trackIds = entries.map(e => e.track_id).filter(Boolean)

  // Gauname tracks be join - tada atlikėjus atskirai
  const { data: tracks, error: tracksError } = await supabase
    .from('tracks')
    .select('id, slug, title, cover_url, artist_id')
    .in('id', trackIds)

  if (tracksError) return NextResponse.json({ error: tracksError.message }, { status: 500 })

  const artistIds = [...new Set((tracks || []).map(t => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map(a => [a.id, a]))

  // Sujungti
  const trackMap = new Map((tracks || []).map(t => [
    t.id,
    { ...t, artists: artistMap.get(t.artist_id) ?? null }
  ]))

  const merged = entries.map(e => ({
    ...e,
    tracks: trackMap.get(e.track_id) ?? null,
  }))

  return NextResponse.json({ entries: merged, week })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { week_id, track_id, position } = body
  const supabase = createAdminClient()

  const { data: week } = await supabase
    .from('top_weeks')
    .select('top_type')
    .eq('id', week_id)
    .single()

  const { data, error } = await supabase
    .from('top_entries')
    .upsert({
      week_id,
      track_id,
      position,
      top_type: week?.top_type || 'top40',
      weeks_in_top: 1,
      total_votes: 0,
      is_new: true,
      peak_position: position,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
