import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

function isAdmin(role?: string) {
  return role === 'admin' || role === 'super_admin'
}

const EDITABLE = [
  'artist_id', 'track_id', 'album_id',
  'display_name', 'display_subtitle', 'country',
  'photo_url', 'video_url', 'lyrics', 'bio',
  'metadata', 'sort_order', 'is_disqualified',
]

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
    .from('voting_participants')
    .update(update)
    .eq('id', parseInt(id))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ participant: data })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session?.user?.role as string))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('voting_participants').delete().eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
