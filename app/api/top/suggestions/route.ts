import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const topType = searchParams.get('type')
  const supabase = createAdminClient()

  let query = supabase
    .from('top_suggestions')
    .select('id, top_type, status, created_at, user_id, track_id')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100)

  if (topType) query = query.eq('top_type', topType)

  const { data: suggestions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!suggestions?.length) return NextResponse.json({ suggestions: [] })

  // Gauti track info
  const trackIds = suggestions.map(s => s.track_id).filter(Boolean)
  const { data: tracks } = trackIds.length > 0
    ? await supabase.from('tracks').select('id, title, artist_id').in('id', trackIds)
    : { data: [] }

  const artistIds = [...new Set((tracks || []).map((t: any) => t.artist_id).filter(Boolean))]
  const { data: artists } = artistIds.length > 0
    ? await supabase.from('artists').select('id, name').in('id', artistIds)
    : { data: [] }

  const artistMap = new Map((artists || []).map((a: any) => [a.id, a]))
  const trackMap = new Map((tracks || []).map((t: any) => [
    t.id, { ...t, artist_name: artistMap.get(t.artist_id)?.name ?? '' }
  ]))

  const enriched = suggestions.map(s => ({
    ...s,
    track: s.track_id ? trackMap.get(s.track_id) ?? null : null,
  }))

  return NextResponse.json({ suggestions: enriched })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { top_type, track_id } = body
  const supabase = createAdminClient()

  if (!track_id) return NextResponse.json({ error: 'Daina nenurodyta' }, { status: 400 })

  // Patikrinti ar dar ne šios savaitės dainos kandidatė
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id')
    .eq('top_type', top_type)
    .eq('is_active', true)
    .single()

  if (week) {
    const { data: alreadyIn } = await supabase
      .from('top_entries')
      .select('id')
      .eq('week_id', week.id)
      .eq('track_id', track_id)
      .maybeSingle()

    if (alreadyIn)
      return NextResponse.json({ error: 'Daina jau šios savaitės kandidatė' }, { status: 409 })
  }

  // Patikrinti ar jau yra toks pasiūlymas
  const { data: existing } = await supabase
    .from('top_suggestions')
    .select('id, status')
    .eq('top_type', top_type)
    .eq('track_id', track_id)
    .maybeSingle()

  if (existing) {
    // Grąžinti esamą (kad PATCH galėtų approve)
    return NextResponse.json({ suggestion: existing })
  }

  const { data, error } = await supabase
    .from('top_suggestions')
    .insert({
      top_type,
      track_id,
      suggested_by_user_id: session.user.id,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ suggestion: data })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, status } = body
  const supabase = createAdminClient()

  const { data: suggestion, error: fetchErr } = await supabase
    .from('top_suggestions')
    .update({
      status,
      reviewed_by: session.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, tracks:track_id(id, title)')
    .single()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Jei approve — automatiškai pridėti į kitą savaitę
  if (status === 'approved' && suggestion.track_id) {
    // Gauti aktyvią savaitę
    const { data: activeWeek } = await supabase
      .from('top_weeks')
      .select('id, top_type')
      .eq('top_type', suggestion.top_type)
      .eq('is_active', true)
      .single()

    if (activeWeek) {
      const { count } = await supabase
        .from('top_entries')
        .select('id', { count: 'exact', head: true })
        .eq('week_id', activeWeek.id)

      await supabase
        .from('top_entries')
        .upsert({
          week_id: activeWeek.id,
          track_id: suggestion.track_id,
          top_type: suggestion.top_type,
          position: (count || 0) + 1,
          vote_count: 0,
          is_new: true,
          weeks_in_top: 1,
          peak_position: (count || 0) + 1,
        }, { onConflict: 'week_id,track_id' })
    }
  }

  return NextResponse.json({ ok: true, suggestion })
}
