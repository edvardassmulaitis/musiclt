import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { headers } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

/**
 * POST /api/voting/vote
 * Body:
 *   - single: { event_id, participant_id, fingerprint? }
 *   - rating: { event_id, participant_id, rating, fingerprint? }
 *   - top_n:  { event_id, selections: [{ participant_id, position }], fingerprint? }
 *
 * Atšaukti bals: DELETE /api/voting/vote?event_id=X[&participant_id=Y]
 */

async function getIp() {
  const h = await headers()
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  )
}

async function checkEventOpen(event_id: number) {
  const supabase = createAdminClient()
  const { data: event } = await supabase
    .from('voting_events')
    .select('*')
    .eq('id', event_id)
    .single()
  if (!event) return { ok: false, error: 'Rinkimai nerasti' as string, event: null as any }

  if (event.status !== 'voting_open') {
    return { ok: false, error: 'Balsavimas neatidarytas', event }
  }
  const now = new Date()
  if (event.vote_open && new Date(event.vote_open) > now) {
    return { ok: false, error: 'Balsavimas dar neprasidėjo', event }
  }
  if (event.vote_close && new Date(event.vote_close) < now) {
    return { ok: false, error: 'Balsavimas jau baigėsi', event }
  }
  return { ok: true, event }
}

export async function POST(req: Request) {
  const body = await req.json()
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  const ip = await getIp()

  const { event_id, participant_id, rating, selections, fingerprint } = body

  if (!event_id) return NextResponse.json({ error: 'Trūksta event_id' }, { status: 400 })

  const check = await checkEventOpen(event_id)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })
  const event = check.event

  if (event.requires_login && !userId)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const supabase = createAdminClient()

  // Tikrinam limitus
  const voteLimit = userId ? event.user_vote_limit : event.anon_vote_limit
  const { count: existingCount } = await supabase
    .from('voting_votes')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event_id)
    .match(userId ? { user_id: userId } : { voter_ip: ip })

  // ============================
  // TOP-N režimas
  // ============================
  if (event.voting_type === 'top_n') {
    if (!Array.isArray(selections) || !selections.length)
      return NextResponse.json({ error: 'Trūksta selections' }, { status: 400 })

    if (event.voting_top_n && selections.length > event.voting_top_n)
      return NextResponse.json({ error: `Per daug selections (max ${event.voting_top_n})` }, { status: 400 })

    // Nutrinti seną balsą (replace)
    if (userId) {
      await supabase.from('voting_votes').delete().eq('event_id', event_id).eq('user_id', userId)
    } else {
      await supabase.from('voting_votes').delete().eq('event_id', event_id).eq('voter_ip', ip).is('user_id', null)
    }

    const inserts = selections.map((s: any) => ({
      event_id,
      participant_id: s.participant_id,
      user_id: userId,
      voter_ip: ip,
      voter_fingerprint: fingerprint || null,
      top_n_position: s.position,
    }))

    const { data, error } = await supabase.from('voting_votes').insert(inserts).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ votes: data, count: data?.length ?? 0 })
  }

  // ============================
  // RATING režimas
  // ============================
  if (event.voting_type === 'rating') {
    if (!participant_id || rating == null)
      return NextResponse.json({ error: 'Trūksta participant_id arba rating' }, { status: 400 })
    if (rating < 1 || rating > event.rating_max)
      return NextResponse.json({ error: `Rating turi būti 1–${event.rating_max}` }, { status: 400 })

    // Upsert (pakeist jei jau balsavo)
    const match = userId
      ? { event_id, participant_id, user_id: userId }
      : { event_id, participant_id, voter_ip: ip }

    const { data: existing } = await supabase
      .from('voting_votes')
      .select('id')
      .match(match)
      .maybeSingle()

    if (existing) {
      const { data, error } = await supabase
        .from('voting_votes')
        .update({ rating, voter_fingerprint: fingerprint || null })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ vote: data, updated: true })
    }

    const { data, error } = await supabase
      .from('voting_votes')
      .insert({
        event_id, participant_id, user_id: userId,
        voter_ip: ip, voter_fingerprint: fingerprint || null, rating,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ vote: data })
  }

  // ============================
  // SINGLE režimas (default)
  // ============================
  if (!participant_id)
    return NextResponse.json({ error: 'Trūksta participant_id' }, { status: 400 })

  // Limitų tikrinimas
  if ((existingCount || 0) >= voteLimit) {
    return NextResponse.json(
      { error: userId ? 'Balsų limitas pasiektas' : 'Anoniminių balsų limitas pasiektas. Prisijunk ir gausi daugiau.', limit: voteLimit },
      { status: 429 }
    )
  }

  // Ar jau balsavo už šį dalyvį?
  const match = userId
    ? { event_id, participant_id, user_id: userId }
    : { event_id, participant_id, voter_ip: ip }

  const { data: existing } = await supabase
    .from('voting_votes')
    .select('id')
    .match(match)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Jau balsavai už šį dalyvį' }, { status: 400 })

  const { data, error } = await supabase
    .from('voting_votes')
    .insert({
      event_id, participant_id, user_id: userId,
      voter_ip: ip, voter_fingerprint: fingerprint || null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    vote: data,
    votes_remaining: voteLimit - ((existingCount || 0) + 1),
  })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  const ip = await getIp()
  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get('event_id')
  const participant_id = searchParams.get('participant_id')

  if (!event_id) return NextResponse.json({ error: 'Trūksta event_id' }, { status: 400 })

  const supabase = createAdminClient()
  let q = supabase.from('voting_votes').delete().eq('event_id', parseInt(event_id))
  if (participant_id) q = q.eq('participant_id', parseInt(participant_id))
  q = userId ? q.eq('user_id', userId) : q.eq('voter_ip', ip).is('user_id', null)

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** GET /api/voting/vote?event_id=X — grąžina balsavusiojo balsą šiame event */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id ?? null
  const ip = await getIp()
  const { searchParams } = new URL(req.url)
  const event_id = searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'Trūksta event_id' }, { status: 400 })

  const supabase = createAdminClient()
  let q = supabase
    .from('voting_votes')
    .select('id, participant_id, rating, top_n_position, created_at')
    .eq('event_id', parseInt(event_id))
  q = userId ? q.eq('user_id', userId) : q.eq('voter_ip', ip).is('user_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ votes: data || [] })
}
