import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCurrentWeekMonday } from '@/lib/top-week'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const topType = searchParams.get('type') || 'top40'
  const weekId = searchParams.get('week_id')
  const supabase = createAdminClient()

  // Find target week — by explicit week_id, or by current calendar week's
  // Monday (week_start anchor). NE TIKRINAM is_active flag — visada
  // einame į einamosios kalendorinės savaitės įrašą.
  let week: any = null
  if (weekId) {
    const { data } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('id', parseInt(weekId))
      .single()
    week = data
  } else {
    const thisMonday = getCurrentWeekMonday()
    const { data } = await supabase
      .from('top_weeks')
      .select('*')
      .eq('top_type', topType)
      .eq('week_start', thisMonday)
      .maybeSingle()
    week = data
  }

  if (!week) return NextResponse.json({ entries: [], week: null })

  const { data: entries, error } = await supabase
    .from('top_entries')
    .select('id, position, prev_position, weeks_in_top, total_votes, is_new, peak_position, track_id')
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries?.length) return NextResponse.json({ entries: [], week })

  const trackIds = entries.map(e => e.track_id).filter(Boolean)
  const { data: tracks } = await supabase
    .from('tracks')
    .select('id, slug, title, cover_url, artist_id')
    .in('id', trackIds)

  const artistIds = [...new Set((tracks || []).map((t: any) => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, slug, name, cover_image_url').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracks || []).map((t: any) => [
    t.id, { ...t, artists: artistMap.get(t.artist_id) ?? null }
  ]))

  const merged = entries.map((e, i) => ({
    ...e,
    position: e.position ?? (i + 1),
    tracks: trackMap.get(e.track_id) ?? null,
  }))

  // BE cache header'ių — admin operacijos (populate, finalize, reset) turi
  // matyti freshness'ą iš karto. Public /top40, /top30 puslapiai naudoja
  // savo Supabase queries (server components), ne /api/top/entries.
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
      total_votes: 0,
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
