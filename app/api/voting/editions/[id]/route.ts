import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

const EDITABLE = [
  'slug', 'name', 'year', 'description', 'cover_image_url',
  'status', 'vote_open', 'vote_close', 'results_visible',
  'sort_order', 'metadata',
]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const isNumeric = /^\d+$/.test(id)

  let eQuery = supabase.from('voting_editions').select('*, voting_channels(*)')
  eQuery = isNumeric ? eQuery.eq('id', parseInt(id)) : eQuery.eq('slug', id)
  const { data: edition, error } = await eQuery.single()

  if (error || !edition) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })

  const { data: events } = await supabase
    .from('voting_events')
    .select('*')
    .eq('edition_id', edition.id)
    .order('sort_order')

  return NextResponse.json({ edition, events: events || [] })
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
    .from('voting_editions')
    .update(update)
    .eq('id', parseInt(id))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ edition: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('voting_editions').delete().eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
