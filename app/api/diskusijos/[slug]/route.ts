import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data: discussion, error } = await supabase
    .from('discussions')
    .select('*')
    .eq('slug', slug)
    .eq('is_deleted', false)
    .single()

  if (error || !discussion)
    return NextResponse.json({ error: 'Nerasta' }, { status: 404 })

  // Padidinti view_count
  await supabase
    .from('discussions')
    .update({ view_count: discussion.view_count + 1 })
    .eq('id', discussion.id)

  return NextResponse.json({ discussion })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { slug } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  const { data: discussion } = await supabase
    .from('discussions').select('user_id').eq('slug', slug).single()
  if (!discussion) return NextResponse.json({ error: 'Nerasta' }, { status: 404 })
  if (discussion.user_id !== session.user.id && !isAdmin)
    return NextResponse.json({ error: 'Neleistina' }, { status: 403 })

  // Admin gali pakeisti is_pinned, is_locked, tags
  // Autorius gali tik keisti title/body
  const updates: any = {}
  if (isAdmin) {
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned
    if (body.is_locked !== undefined) updates.is_locked = body.is_locked
  }
  if (discussion.user_id === session.user.id) {
    if (body.title) updates.title = body.title.trim()
    if (body.text) updates.body = body.text.trim()
    if (body.tags) updates.tags = body.tags.slice(0, 5)
  }

  const { data, error } = await supabase
    .from('discussions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ discussion: data })
}
