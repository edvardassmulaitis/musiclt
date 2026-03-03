import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || todayLT()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('daily_song_nominations')
    .select(`
      id, date, comment, created_at,
      tracks (
        id, slug, title, cover_url, spotify_id, video_url,
        artists ( id, slug, name, cover_image_url )
      ),
      user_id
    `)
    .eq('date', date)
    .is('removed_at', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const nominationIds = (data || []).map(n => n.id)
  let voteCounts: Record<number, { total: number; weighted: number }> = {}

  if (nominationIds.length > 0) {
    const { data: votes } = await supabase
      .from('daily_song_votes')
      .select('nomination_id, weight')
      .eq('date', date)
      .in('nomination_id', nominationIds)
    for (const v of votes || []) {
      if (!voteCounts[v.nomination_id]) voteCounts[v.nomination_id] = { total: 0, weighted: 0 }
      voteCounts[v.nomination_id].total += 1
      voteCounts[v.nomination_id].weighted += v.weight
    }
  }

  const enriched = (data || []).map(n => ({
    ...n,
    votes: voteCounts[n.id]?.total || 0,
    weighted_votes: voteCounts[n.id]?.weighted || 0,
  })).sort((a, b) => b.weighted_votes - a.weighted_votes)

  return NextResponse.json({ nominations: enriched, date })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { track_id, comment } = body

  if (!track_id)
    return NextResponse.json({ error: 'Trūksta dainos' }, { status: 400 })

  const date = todayLT()
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('daily_song_nominations')
    .select('id')
    .eq('date', date)
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (existing)
    return NextResponse.json({ error: 'Jau pasiūlei dainą šiandien' }, { status: 400 })

  const { data, error } = await supabase
    .from('daily_song_nominations')
    .insert({
      date,
      track_id,
      user_id: session.user.id,
      comment: comment?.trim() || null,
    })
    .select(`
      id, date, comment, created_at,
      tracks ( id, slug, title, cover_url, artists ( id, slug, name ) )
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ nomination: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('daily_song_nominations')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
