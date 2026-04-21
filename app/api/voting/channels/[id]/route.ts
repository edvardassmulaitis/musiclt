import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  // Gali paduoti id arba slug
  const isNumeric = /^\d+$/.test(id)
  let chQuery = supabase.from('voting_channels').select('*')
  chQuery = isNumeric ? chQuery.eq('id', parseInt(id)) : chQuery.eq('slug', id)
  const { data: channel, error } = await chQuery.single()

  if (error || !channel) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })

  const { data: editions } = await supabase
    .from('voting_editions')
    .select('*')
    .eq('channel_id', channel.id)
    .order('year', { ascending: false })
    .order('sort_order')

  return NextResponse.json({ channel, editions: editions || [] })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  const update: Record<string, any> = {}
  for (const k of ['slug', 'name', 'description', 'logo_url', 'cover_image_url', 'is_active', 'sort_order']) {
    if (k in body) update[k] = body[k]
  }

  const { data, error } = await supabase
    .from('voting_channels')
    .update(update)
    .eq('id', parseInt(id))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channel: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('voting_channels').delete().eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
