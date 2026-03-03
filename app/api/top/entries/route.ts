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

  if (!targetWeekId) return NextResponse.json({ entries: [], week: null })

  const { data: week } = await supabase
    .from('top_weeks')
    .select('*')
    .eq('id', targetWeekId)
    .single()

  const { data: entries, error } = await supabase
    .from('top_entries')
    .select('id, position, prev_position, weeks_in_top, vote_count, is_new, peak_position, track_id')
    .eq('week_id', targetWeekId)
    .order(week?.is_finalized ? 'position' : 'vote_count', { ascending: week?.is_finalized ? true : false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries?.length) return NextResponse.json({ entries: [], week })

  const trackIds = entries.map(e => e.track_id).filter(Boolean)
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, slug, title, cover_url, artist_id')
    .in('id', trackIds)

  const artistIds = [...new Set((tracks || []).map((t: any) => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, slug, name').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracks || []).map((t: any) => [
    t.id, { ...t, artists: artistMap.get(t.artist_id) ?? null }
  ]))

  const merged = entries.map((e, i) => ({
    ...e,
    position: e.position ?? (i + 1), // jei nefinalizuota — rikiuoti pagal balsus
    tracks: trackMap.get(e.track_id) ?? null,
  }))

  return NextResponse.json({ entries: merged, week })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { week_id, track_id } = body
  const supabase = createAdminClient()

  const { data: week } = await supabase
    .from('top_weeks')
    .select('top_type, is_finalized')
    .eq('id', week_id)
    .single()

  if (week?.is_finalized)
    return NextResponse.json({ error: 'Savaitė jau uždaryta' }, { status: 400 })

  // Kiek jau yra įrašų — pozicijai (laikina, bus pakeista po finalizavimo)
  const { count } = await supabase
    .from('top_entries')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)

  const { data, error } = await supabase
    .from('top_entries')
    .upsert({
      week_id,
      track_id,
      top_type: week?.top_type || 'top40',
      position: (count || 0) + 1,
      vote_count: 0,
      is_new: true,
      weeks_in_top: 1,
      peak_position: (count || 0) + 1,
    }, { onConflict: 'week_id,track_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createAdminClient()

  const { error } = await supabase.from('top_entries').delete().eq('id', id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
