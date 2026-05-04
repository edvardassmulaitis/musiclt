import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'

// Per-song limits (vienai dainai gali atiduoti kiek balsų):
//   - Anonymous: 5
//   - Signed-in user: 10
// Be bendrosios savaitinės limit'os — gali balsuoti tiek dainų, kiek nori.
const ANON_PER_SONG = 5
const USER_PER_SONG = 10

/**
 * Vote endpoint — kiekvienas POST = +1 balsas konkrečiai dainai.
 *
 * Body: { track_id, week_id, vote_type='like' }
 *
 * Per-song limit'as taikomas atskirai kiekvienai dainai (top_votes audit
 * trail'as: 1 row = 1 balsas). Jokio bendrojo savaitinio cap'o.
 */
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
  if (week.is_finalized) return NextResponse.json({ error: 'Savaitė jau finalizuota' }, { status: 400 })

  const userId = session?.user?.id ?? null
  const perSongLimit = userId ? USER_PER_SONG : ANON_PER_SONG

  // Per-song limit check: kiek balsų user'is jau atidavė šitam track'ui?
  const songVotesQuery = supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .eq('track_id', track_id)
    .eq('vote_type', 'like')

  const { count: songVotesBefore } = userId
    ? await songVotesQuery.eq('user_id', userId)
    : await songVotesQuery.eq('voter_ip', ip)

  if ((songVotesBefore || 0) >= perSongLimit) {
    return NextResponse.json({
      error: userId
        ? `Maks. ${perSongLimit} balsų vienai dainai`
        : `Maks. ${perSongLimit} balsų vienai dainai (registruotiems — ${USER_PER_SONG})`,
      limit: perSongLimit,
      song_votes: songVotesBefore || 0,
    }, { status: 429 })
  }

  // Insert vote row (audit trail: 1 row = 1 vote)
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
  // Tik PIRMAM balsui už šitą dainą (kad nespamintume feed'o).
  try {
    if (userId && (songVotesBefore || 0) === 0) {
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

  return NextResponse.json({
    vote: data,
    user_song_votes: (songVotesBefore || 0) + 1,
    song_limit: perSongLimit,
  })
}

/**
 * GET — gražina vartotojo balsų state'ą:
 *   - votes_per_track: { [track_id]: count }
 *   - is_authenticated, per_song_limit
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekId = searchParams.get('week_id')
  const session = await getServerSession(authOptions)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null
  const perSongLimit = userId ? USER_PER_SONG : ANON_PER_SONG

  const query = supabase
    .from('top_votes')
    .select('track_id')
    .eq('week_id', weekId!)
    .eq('vote_type', 'like')

  const { data: myVotes } = userId
    ? await query.eq('user_id', userId)
    : await query.eq('voter_ip', ip)

  // Agregavimas: kiek balsų user'is atidavė kiekvienai dainai
  const votesPerTrack: Record<number, number> = {}
  ;(myVotes || []).forEach((v: any) => {
    votesPerTrack[v.track_id] = (votesPerTrack[v.track_id] || 0) + 1
  })

  return NextResponse.json({
    votes_per_track: votesPerTrack,
    voted_track_ids: Object.keys(votesPerTrack).map(Number),
    is_authenticated: !!userId,
    per_song_limit: perSongLimit,
    // Backward-compat (kol kas kviečiama UI)
    votes_used: myVotes?.length || 0,
    votes_remaining: 999,
    limit: 999,
  })
}
