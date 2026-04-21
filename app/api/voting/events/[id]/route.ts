import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { enrichParticipants } from '@/lib/supabase-voting'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

const EDITABLE = [
  'slug', 'name', 'description', 'participant_type', 'voting_type',
  'voting_top_n', 'rating_max', 'requires_login',
  'anon_vote_limit', 'user_vote_limit',
  'status', 'vote_open', 'vote_close', 'results_visible',
  'sort_order', 'metadata',
]

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const includeResults = searchParams.get('results') === 'true'
  const supabase = createAdminClient()
  const isNumeric = /^\d+$/.test(id)

  let eQuery = supabase
    .from('voting_events')
    .select('*, voting_editions(*, voting_channels(*))')
  eQuery = isNumeric ? eQuery.eq('id', parseInt(id)) : eQuery.eq('slug', id)
  const { data: event, error } = await eQuery.single()

  if (error || !event) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })

  const { data: participants } = await supabase
    .from('voting_participants')
    .select('*')
    .eq('event_id', event.id)
    .order('sort_order')

  const enriched = await enrichParticipants(participants || [])

  // Sprendžiam ar rezultatai matomi
  const now = new Date()
  const isClosed =
    event.status === 'voting_closed' ||
    event.status === 'archived' ||
    (event.vote_close && new Date(event.vote_close) < now)

  let showResults = includeResults
  if (event.results_visible === 'never') showResults = false
  if (event.results_visible === 'after_close' && !isClosed) showResults = false

  if (!showResults) {
    enriched.forEach(p => {
      p.vote_count = undefined
      p.avg_rating = undefined
      p.top_n_score = undefined
    })
  }

  return NextResponse.json({ event, participants: enriched, show_results: showResults })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  const update: Record<string, any> = {}
  for (const k of EDITABLE) if (k in body) update[k] = body[k]

  const { data, error } = await supabase
    .from('voting_events')
    .update(update)
    .eq('id', parseInt(id))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('voting_events').delete().eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
