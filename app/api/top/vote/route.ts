import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'

const ANON_WEEKLY_LIMIT = 5
const USER_WEEKLY_LIMIT = 10

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()
  const { track_id, week_id, vote_type = 'like', top10_position, fingerprint } = body

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headersList.get('x-real-ip')
    || 'unknown'

  const supabase = createAdminClient()

  const { data: week } = await supabase
    .from('top_weeks').select('*').eq('id', week_id).single()
  if (!week) return NextResponse.json({ error: 'Savaitė nerasta' }, { status: 404 })

  const userId = session?.user?.id ?? null

  // Tikrinti ar jau balsavo už šią dainą
  if (userId) {
    const { data: existing } = await supabase
      .from('top_votes')
      .select('id')
      .eq('week_id', week_id)
      .eq('track_id', track_id)
      .eq('user_id', userId)
      .eq('vote_type', vote_type)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Jau balsavai už šią dainą' }, { status: 400 })
  } else {
    const { data: existing } = await supabase
      .from('top_votes')
      .select('id')
      .eq('week_id', week_id)
      .eq('track_id', track_id)
      .eq('voter_ip', ip)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Jau balsavai už šią dainą' }, { status: 400 })
  }

  // Tikrinti savaitinį limitą
  if (userId) {
    const { count } = await supabase
      .from('top_votes')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', week_id)
      .eq('user_id', userId)
      .eq('vote_type', 'like')
    if ((count || 0) >= USER_WEEKLY_LIMIT)
      return NextResponse.json({ error: 'Savaitinis balsų limitas pasiektas', limit: USER_WEEKLY_LIMIT }, { status: 429 })
  } else {
    const { count } = await supabase
      .from('top_votes')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', week_id)
      .eq('voter_ip', ip)
      .eq('vote_type', 'like')
    if ((count || 0) >= ANON_WEEKLY_LIMIT)
      return NextResponse.json({
        error: 'Savaitinis balsų limitas pasiektas. Registruokis ir gauk daugiau!',
        limit: ANON_WEEKLY_LIMIT,
      }, { status: 429 })
  }

  const { data, error } = await supabase.from('top_votes').insert({
    week_id,
    track_id,
    user_id: userId,
    voter_ip: ip,
    voter_fingerprint: fingerprint || null,
    vote_type,
    top10_position: vote_type === 'top10' ? top10_position : null,
    votes: 1,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Activity feed ────────────────────────────────────────────────
  try {
    if (userId) {
      const { data: track } = await supabase
        .from('tracks')
        .select('title, slug, cover_image_url, artists:artist_id(slug, name, cover_image_url)')
        .eq('id', track_id)
        .maybeSingle() as { data: any }
      const artistSlug = track?.artists?.slug
      const url = artistSlug && track?.slug ? `/atlikejai/${artistSlug}/${track.slug}` : (week?.top_type === 'lt_top30' ? '/top30' : '/top40')
      const fullTitle = track ? `${track.title}${track.artists?.name ? ' — ' + track.artists.name : ''}` : 'daina'
      await logActivity({
        event_type: 'top_vote',
        user_id: userId,
        actor_name: (session?.user as any)?.name || null,
        actor_avatar: (session?.user as any)?.image || null,
        entity_type: 'track',
        entity_id: track_id,
        entity_title: fullTitle,
        entity_url: url,
        entity_image: track?.cover_image_url || track?.artists?.cover_image_url || null,
        metadata: { week_id, vote_type, top_type: week?.top_type || null },
      })
    }
  } catch (e: any) {
    console.error('[activity-log] top_vote failed:', e?.message || e)
  }

  const limit = userId ? USER_WEEKLY_LIMIT : ANON_WEEKLY_LIMIT
  const { count: used } = await supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .match(userId ? { user_id: userId } : { voter_ip: ip })
    .eq('vote_type', 'like')

  return NextResponse.json({ vote: data, votes_remaining: limit - (used || 0) })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekId = searchParams.get('week_id')
  const session = await getServerSession(authOptions)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null
  const limit = userId ? USER_WEEKLY_LIMIT : ANON_WEEKLY_LIMIT

  const query = supabase
    .from('top_votes')
    .select('track_id', { count: 'exact' })
    .eq('week_id', weekId!)
    .eq('vote_type', 'like')

  const { data: myVotes, count } = userId
    ? await query.eq('user_id', userId)
    : await query.eq('voter_ip', ip)

  return NextResponse.json({
    votes_used: count || 0,
    votes_remaining: limit - (count || 0),
    voted_track_ids: (myVotes || []).map((v: any) => v.track_id),
    is_authenticated: !!userId,
  })
}
