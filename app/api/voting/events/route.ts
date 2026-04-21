import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/supabase-voting'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const editionId = searchParams.get('edition_id')
  const supabase = createAdminClient()

  let q = supabase.from('voting_events').select('*').order('sort_order')
  if (editionId) q = q.eq('edition_id', parseInt(editionId))

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data || [] })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.edition_id || !body.name)
    return NextResponse.json({ error: 'Trūksta edition_id arba pavadinimo' }, { status: 400 })

  const slug = body.slug || slugify(body.name)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('voting_events')
    .insert({
      edition_id: body.edition_id,
      slug,
      name: body.name,
      description: body.description || null,
      participant_type: body.participant_type || 'artist_song',
      voting_type: body.voting_type || 'single',
      voting_top_n: body.voting_top_n || null,
      rating_max: body.rating_max ?? 10,
      requires_login: body.requires_login ?? false,
      anon_vote_limit: body.anon_vote_limit ?? 1,
      user_vote_limit: body.user_vote_limit ?? 1,
      status: body.status || 'draft',
      vote_open: body.vote_open || null,
      vote_close: body.vote_close || null,
      results_visible: body.results_visible || 'always',
      sort_order: body.sort_order ?? 0,
      metadata: body.metadata || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}
