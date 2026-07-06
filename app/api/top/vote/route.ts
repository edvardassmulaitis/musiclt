import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'
import { clientIpFromHeaders } from '@/lib/rate-limit'
import { deviceVoteGuard, anonFingerprintCount } from '@/lib/vote-guard'

// Per-song limit: 10 balsų vienai dainai (visiems — anon ir signed-in).
// Skirtumas: signed-in vartotojo balsas turi 3× svorį finalize skaičiavime.
// Be bendrosios savaitinės limit'os — gali balsuoti už tiek dainų, kiek nori.
const PER_SONG_LIMIT = 10

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
  const ip = clientIpFromHeaders(headersList)

  const supabase = createAdminClient()

  const userId = session?.user?.id ?? null
  console.log('[top-vote] POST', { week_id, track_id, vote_type, userId, ip })

  const { data: week, error: weekErr } = await supabase
    .from('top_weeks').select('*').eq('id', week_id).single()
  if (weekErr) console.error('[top-vote] week fetch error', weekErr)
  if (!week) {
    console.warn('[top-vote] week not found', { week_id })
    return NextResponse.json({ error: 'Savaitė nerasta' }, { status: 404 })
  }
  if (week.is_finalized) {
    console.warn('[top-vote] week is finalized', { week_id })
    return NextResponse.json({ error: 'Savaitė jau finalizuota' }, { status: 400 })
  }

  // Per-song limit check — KRITIŠKAI svarbu izoliuoti anon vs signed-in balsus
  // pagal user_id, NE tik IP. Kitaip neprisijungęs vartotojas tame pačiame IP
  // (pvz. incognito tab) matys signed-in vartotojo balsus.
  const songVotesQuery = supabase
    .from('top_votes')
    .select('id', { count: 'exact', head: true })
    .eq('week_id', week_id)
    .eq('track_id', track_id)
    .eq('vote_type', 'like')

  const { count: songVotesBefore } = userId
    ? await songVotesQuery.eq('user_id', userId)
    : await songVotesQuery.eq('voter_ip', ip).is('user_id', null)

  if ((songVotesBefore || 0) >= PER_SONG_LIMIT) {
    console.warn('[top-vote] per-song limit reached', { week_id, track_id, userId, songVotesBefore })
    return NextResponse.json({
      error: `Maks. ${PER_SONG_LIMIT} balsų vienai dainai`,
      limit: PER_SONG_LIMIT,
      song_votes: songVotesBefore || 0,
    }, { status: 429 })
  }

  // ── ANTI-CHEAT: įrenginio/IP paskyrų limitas (multi-account farming) ──
  if (userId) {
    const g = await deviceVoteGuard({
      table: 'top_votes', scopeColumn: 'week_id', scopeValue: week_id,
      userId, fingerprint: fingerprint || null, ip,
    })
    if (!g.allowed) {
      return NextResponse.json({ error: 'Per daug paskyrų iš šio įrenginio/tinklo.' }, { status: 429 })
    }
  } else if (fingerprint) {
    // Anon: fingerprint kaip papildomas per-song dedup matmuo (šalia IP).
    const fpCount = await anonFingerprintCount({
      table: 'top_votes', scopeColumn: 'week_id', scopeValue: week_id,
      targetColumn: 'track_id', targetValue: track_id, fingerprint,
    })
    if (fpCount >= PER_SONG_LIMIT) {
      return NextResponse.json({ error: `Maks. ${PER_SONG_LIMIT} balsų vienai dainai`, limit: PER_SONG_LIMIT }, { status: 429 })
    }
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

  if (error) {
    console.error('[top-vote] INSERT FAILED', { week_id, track_id, userId, error })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  console.log('[top-vote] OK', { week_id, track_id, userId, voteId: data?.id })

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
    song_limit: PER_SONG_LIMIT,
  })
}

/**
 * GET — gražina vartotojo balsų state'ą:
 *   - votes_per_track: { [track_id]: count }
 *   - is_authenticated, per_song_limit
 *
 * KRITIŠKAI: anon query'inam ne tik pagal voter_ip, bet ir filter'inam
 * `user_id IS NULL` — kitaip iš to paties IP signed-in vartotojo balsai
 * "nutekės" anon session'ams (incognito).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const weekId = searchParams.get('week_id')
  const session = await getServerSession(authOptions)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null

  const query = supabase
    .from('top_votes')
    .select('track_id')
    .eq('week_id', weekId!)
    .eq('vote_type', 'like')

  const { data: myVotes } = userId
    ? await query.eq('user_id', userId)
    : await query.eq('voter_ip', ip).is('user_id', null)

  const votesPerTrack: Record<number, number> = {}
  ;(myVotes || []).forEach((v: any) => {
    votesPerTrack[v.track_id] = (votesPerTrack[v.track_id] || 0) + 1
  })

  return NextResponse.json({
    votes_per_track: votesPerTrack,
    voted_track_ids: Object.keys(votesPerTrack).map(Number),
    is_authenticated: !!userId,
    per_song_limit: PER_SONG_LIMIT,
    votes_used: myVotes?.length || 0,
    votes_remaining: 999,
    limit: PER_SONG_LIMIT,
  })
}
