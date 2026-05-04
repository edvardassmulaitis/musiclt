import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'

const ANON_WEEKLY_LIMIT = 5
const USER_WEEKLY_LIMIT = 10

/**
 * Multi-vote system: vienas vartotojas gali atiduoti iki 10 (5 anon) balsų
 * per savaitę, paskirstydamas tarp vienos arba kelių dainų. Vienam clickui
 * = 1 balsas tai pačiai dainai (galima stack'inti tai pačiai keletą kartų).
 *
 * top_votes lentelėje saugomi atskiri eilučių įrašai per kiekvieną balsą
 * (audit trail). finalize_top_week skaičiuoja per COUNT(*).
 *
 * Body: { track_id, week_id, vote_type='like' }
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

  // Patikrinti savaitinį limitą — multi-vote: skaičiuojam VISUS user'io balsus
  // šitai savaitei (ne tik distinct dainas)
  const limit = userId ? USER_WEEKLY_LIMIT : ANON_WEEKLY_LIMIT
  const limitQuery = supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .eq('vote_type', 'like')

  const { count: usedBefore } = userId
    ? await limitQuery.eq('user_id', userId)
    : await limitQuery.eq('voter_ip', ip)

  if ((usedBefore || 0) >= limit)
    return NextResponse.json({
      error: userId
        ? `Savaitinis balsų limitas pasiektas (${limit}/${limit})`
        : `Savaitinis balsų limitas pasiektas. Registruokis ir gauk daugiau!`,
      limit,
      votes_remaining: 0,
    }, { status: 429 })

  // Insert ONE vote row (audit trail) — jokio duplicate'o check'o, multi-vote OK
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
    if (userId) {
      const { count: songVotes } = await supabase
        .from('top_votes')
        .select('id', { count: 'exact', head: true })
        .eq('week_id', week_id)
        .eq('track_id', track_id)
        .eq('user_id', userId)
        .eq('vote_type', 'like')

      if ((songVotes || 0) === 1) {
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
    }
  } catch (e: any) {
    console.error('[activity-log] top_vote failed:', e?.message || e)
  }

  // Suskaičiuoti dabartinius balsus už šitą dainą (visus, ne tik šito user'io)
  const { count: trackTotalVotes } = await supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .eq('track_id', track_id)
    .eq('vote_type', 'like')

  // Vartotojo balsų skaičius už šitą dainą
  const trackQuery = supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .eq('track_id', track_id)
    .eq('vote_type', 'like')

  const { count: userTrackVotes } = userId
    ? await trackQuery.eq('user_id', userId)
    : await trackQuery.eq('voter_ip', ip)

  return NextResponse.json({
    vote: data,
    votes_remaining: limit - (usedBefore || 0) - 1,
    votes_used: (usedBefore || 0) + 1,
    track_total_votes: trackTotalVotes || 0,
    user_track_votes: userTrackVotes || 0,
  })
}

/**
 * GET — gražina vartotojo balsų state'ą už šitą savaitę:
 *   - votes_used, votes_remaining
 *   - votes_per_track (Map: track_id → count of user's votes for that track)
 */
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
    .select('track_id')
    .eq('week_id', weekId!)
    .eq('vote_type', 'like')

  const { data: myVotes } = userId
    ? await query.eq('user_id', userId)
    : await query.eq('voter_ip', ip)

  // Agregavimas: kiek balsų vartotojas atidavė kiekvienai dainai
  const votesPerTrack: Record<number, number> = {}
  ;(myVotes || []).forEach((v: any) => {
    votesPerTrack[v.track_id] = (votesPerTrack[v.track_id] || 0) + 1
  })

  const totalUsed = myVotes?.length || 0

  return NextResponse.json({
    votes_used: totalUsed,
    votes_remaining: limit - totalUsed,
    votes_per_track: votesPerTrack,
    voted_track_ids: Object.keys(votesPerTrack).map(Number), // backward-compat
    is_authenticated: !!userId,
    limit,
  })
}
