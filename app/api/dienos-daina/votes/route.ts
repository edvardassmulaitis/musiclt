import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const body = await req.json()
  const { nomination_id, fingerprint } = body

  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headersList.get('x-real-ip')
    || 'unknown'

  const date = todayLT()
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null

  // Patikrinti ar nominacija egzistuoja ir yra šios dienos
  const { data: nomination } = await supabase
    .from('daily_song_nominations')
    .select('id, track_id, date')
    .eq('id', nomination_id)
    .eq('date', date)
    .is('removed_at', null)
    .single()

  if (!nomination)
    return NextResponse.json({ error: 'Nominacija nerasta' }, { status: 404 })

  // Patikrinti ar jau balsavo šiandien
  if (userId) {
    const { data: existing } = await supabase
      .from('daily_song_votes')
      .select('id')
      .eq('date', date)
      .eq('user_id', userId)
      .maybeSingle()
    if (existing)
      return NextResponse.json({ error: 'Jau balsavai šiandien' }, { status: 400 })
  } else {
    // Anon: tikrinti IP
    const { data: existing } = await supabase
      .from('daily_song_votes')
      .select('id')
      .eq('date', date)
      .eq('voter_ip', ip)
      .maybeSingle()
    if (existing)
      return NextResponse.json({ error: 'Jau balsavai šiandien' }, { status: 400 })
  }

  const weight = userId ? 2 : 1

  const { data, error } = await supabase
    .from('daily_song_votes')
    .insert({
      date,
      nomination_id,
      track_id: nomination.track_id,
      user_id: userId,
      voter_ip: ip,
      voter_fingerprint: fingerprint || null,
      weight,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Activity feed ────────────────────────────────────────────────
  try {
    if (userId) {
      const { data: track } = await supabase
        .from('tracks')
        .select('id, slug, title, cover_image_url, artist_id, artists:artist_id(slug, name, cover_image_url)')
        .eq('id', nomination.track_id)
        .maybeSingle() as { data: any }
      const fullTitle = track ? `${track.title}${track.artists?.name ? ' — ' + track.artists.name : ''}` : 'daina'
      await logActivity({
        event_type: 'daily_vote',
        user_id: userId,
        actor_name: (session?.user as any)?.name || null,
        actor_avatar: (session?.user as any)?.image || null,
        entity_type: 'track',
        entity_id: nomination.track_id,
        entity_title: fullTitle,
        entity_url: '/dienos-daina',
        entity_image: track?.cover_image_url || track?.artists?.cover_image_url || null,
      })
    }
  } catch (e: any) {
    console.error('[activity-log] daily_vote failed:', e?.message || e)
  }

  return NextResponse.json({ vote: data, weight })
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const date = todayLT()
  const supabase = createAdminClient()
  const userId = session?.user?.id ?? null

  let hasVoted = false
  let votedNominationId: number | null = null

  if (userId) {
    const { data } = await supabase
      .from('daily_song_votes')
      .select('id, nomination_id')
      .eq('date', date)
      .eq('user_id', userId)
      .maybeSingle()
    hasVoted = !!data
    votedNominationId = data?.nomination_id ?? null
  } else {
    const { data } = await supabase
      .from('daily_song_votes')
      .select('id, nomination_id')
      .eq('date', date)
      .eq('voter_ip', ip)
      .maybeSingle()
    hasVoted = !!data
    votedNominationId = data?.nomination_id ?? null
  }

  // Streak: kiek dienų iš eilės balsavo (tik registruotiems)
  let streak = 0
  if (userId) {
    const { data: recentVotes } = await supabase
      .from('daily_song_votes')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30)

    if (recentVotes?.length) {
      const dates = recentVotes.map(v => v.date)
      const today = new Date(date)
      let checkDate = new Date(today)
      // Jei šiandien jau balsavo - pradėti nuo šiandien, kitaip nuo vakar
      if (!hasVoted) checkDate.setDate(checkDate.getDate() - 1)

      for (let i = 0; i < 30; i++) {
        const d = checkDate.toISOString().split('T')[0]
        if (dates.includes(d)) {
          streak++
          checkDate.setDate(checkDate.getDate() - 1)
        } else {
          break
        }
      }
    }
  }

  return NextResponse.json({ has_voted: hasVoted, voted_nomination_id: votedNominationId, streak, is_authenticated: !!userId })
}
