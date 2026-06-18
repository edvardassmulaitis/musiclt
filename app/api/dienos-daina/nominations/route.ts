import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
// (dienos daina: voters + already_nominated)
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function todayLT(): string {
  return new Date().toLocaleDateString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).split('.').reverse().join('-')
}

async function logActivity(supabase: any, session: any, eventType: string, entityType: string, entityId: number, entityTitle: string, entityUrl: string | null) {
  try {
    await supabase.from('activity_events').insert({
      event_type: eventType,
      user_id: session.user.id,
      actor_name: session.user.name || session.user.email || 'Vartotojas',
      actor_avatar: session.user.image || null,
      entity_type: entityType,
      entity_id: entityId,
      entity_title: entityTitle,
      entity_url: entityUrl,
      is_public: true,
    })
  } catch (e) {
    // Nesustabdo pagrindinio flow
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || todayLT()
  const supabase = createAdminClient()
  // Ar PRISIJUNGĘS vartotojas jau pasiūlė šią dieną — kad UI paslėptų
  // „Pasiūlyti" kortelę (vienas pasiūlymas per dieną). 2026-06-01.
  const session = await getServerSession(authOptions)
  const sessionUserId = (session?.user as any)?.id ?? null
  const { data, error } = await supabase
    .from('daily_song_nominations')
    .select(`
      id, date, comment, created_at,
      tracks!track_id (
        id, slug, title, cover_url, spotify_id, video_url,
        artists!artist_id ( id, slug, name, cover_image_url )
      ),
      user_id,
      proposer:profiles!daily_song_nominations_user_id_fkey ( username, full_name, avatar_url )
    `)
    .eq('date', date)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const nominationIds = (data || []).map(n => n.id)
  let voteCounts: Record<number, { total: number; weighted: number }> = {}
  // Kas balsavo (registruoti vartotojai) + anonimų skaičius — rodom modale.
  const voterIdsByNom: Record<number, string[]> = {}
  const anonByNom: Record<number, number> = {}
  if (nominationIds.length > 0) {
    const { data: votes } = await supabase
      .from('daily_song_votes')
      .select('nomination_id, weight, user_id')
      .eq('date', date)
      .in('nomination_id', nominationIds)
    for (const v of votes || []) {
      if (!voteCounts[v.nomination_id]) voteCounts[v.nomination_id] = { total: 0, weighted: 0 }
      voteCounts[v.nomination_id].total += 1
      voteCounts[v.nomination_id].weighted += v.weight
      if (v.user_id) (voterIdsByNom[v.nomination_id] ||= []).push(v.user_id)
      else anonByNom[v.nomination_id] = (anonByNom[v.nomination_id] || 0) + 1
    }
  }
  // Balsuotojų profiliai (vienas batch query).
  const allVoterIds = Array.from(new Set(Object.values(voterIdsByNom).flat()))
  const profileById: Record<string, { username: string | null; full_name: string | null; avatar_url: string | null }> = {}
  if (allVoterIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', allVoterIds)
    for (const p of (profs || []) as any[]) profileById[p.id] = { username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
  }
  const enriched = (data || []).map(n => ({
    ...n,
    votes: voteCounts[n.id]?.total || 0,
    weighted_votes: voteCounts[n.id]?.weighted || 0,
    voters: (voterIdsByNom[n.id] || []).map(uid => profileById[uid]).filter(Boolean),
    anon_votes: anonByNom[n.id] || 0,
    own: !!sessionUserId && (n as any).user_id === sessionUserId,
  })).sort((a, b) => b.weighted_votes - a.weighted_votes)
  const alreadyNominated = !!sessionUserId && (data || []).some((n: any) => n.user_id === sessionUserId)
  return NextResponse.json({ nominations: enriched, date, already_nominated: alreadyNominated, is_authenticated: !!sessionUserId })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { track_id, comment } = body
  if (!track_id)
    return NextResponse.json({ error: 'Truksta dainos' }, { status: 400 })

  const date = todayLT()
  const supabase = createAdminClient()

  const { data: existing } = await supabase
    .from('daily_song_nominations')
    .select('id')
    .eq('date', date)
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (existing)
    return NextResponse.json({ error: 'Jau pasiulei daina siandien' }, { status: 400 })

  // Taisyklė (2026-06-10): negalima siūlyti dainos, kuri buvo siūloma VAKAR
  // (arba jau pasiūlyta šiandien) — kitaip tos pačios dainos suktųsi ratu.
  const yday = new Date(`${date}T12:00:00Z`)
  yday.setUTCDate(yday.getUTCDate() - 1)
  const ydayStr = yday.toISOString().slice(0, 10)
  const { data: recentSame } = await supabase
    .from('daily_song_nominations')
    .select('id, date')
    .eq('track_id', track_id)
    .in('date', [date, ydayStr])
    .limit(1)
  if (recentSame && recentSame.length)
    return NextResponse.json({ error: (recentSame[0] as any).date === date ? 'Ši daina šiandien jau pasiūlyta' : 'Ši daina buvo siūloma vakar — pasiūlyk kitą' }, { status: 400 })

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
      tracks!track_id ( id, slug, title, cover_url, artists!artist_id ( id, slug, name ) )
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log activity
  const track = (data as any).tracks
  const trackTitle = track?.title || 'Daina'
  const artistName = track?.artists?.name
  const label = artistName ? `${trackTitle} — ${artistName}` : trackTitle
  await logActivity(supabase, session, 'nomination', 'track', track_id, label, '/dienos-daina')

  return NextResponse.json({ nomination: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['editor', 'admin', 'super_admin'].includes(session.user.role))
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
