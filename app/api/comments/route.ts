import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { headers } from 'next/headers'

const EDIT_WINDOW_MINUTES = 20

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')!
  const entityId = searchParams.get('entity_id')!
  const sort = searchParams.get('sort') || 'popular' // popular | newest | oldest
  const limit = parseInt(searchParams.get('limit') || '50')

  const supabase = createAdminClient()

  let query = supabase
    .from('comments')
    .select('id, parent_id, depth, user_id, author_name, author_avatar, is_archived, body, is_deleted, like_count, reported_count, created_at, edited_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .limit(limit)

  if (sort === 'newest') query = query.order('created_at', { ascending: false })
  else if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else query = query.order('like_count', { ascending: false }).order('created_at', { ascending: true })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Soft-deleted kommentarams paslėpti body
  const sanitized = (data || []).map(c => ({
    ...c,
    body: c.is_deleted ? '[Komentaras pašalintas]' : c.body,
    author_name: c.is_deleted ? null : c.author_name,
  }))

  return NextResponse.json({ comments: sanitized })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { entity_type, entity_id, parent_id, text } = body

  if (!text?.trim() || text.trim().length < 2)
    return NextResponse.json({ error: 'Komentaras per trumpas' }, { status: 400 })
  if (text.trim().length > 5000)
    return NextResponse.json({ error: 'Komentaras per ilgas (max 5000)' }, { status: 400 })

  const supabase = createAdminClient()

  // Nustatyti depth ir path
  let depth = 0
  let path = ''

  if (parent_id) {
    const { data: parent } = await supabase
      .from('comments')
      .select('id, depth, path')
      .eq('id', parent_id)
      .single()

    if (!parent) return NextResponse.json({ error: 'Tėvinis komentaras nerastas' }, { status: 404 })
    depth = Math.min(parent.depth + 1, 4) // Max 4 lygiai
    path = parent.path
  }

  const { data, error } = await supabase
    .from('comments')
    .insert({
      entity_type,
      entity_id,
      parent_id: parent_id || null,
      depth,
      path,
      user_id: session.user.id,
      author_name: session.user.name || session.user.email || 'Vartotojas',
      author_avatar: session.user.image || null,
      body: text.trim(),
    })
    .select('id, parent_id, depth, user_id, author_name, author_avatar, body, like_count, created_at, is_archived, edited_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Atnaujinti path su nauju id
  await supabase
    .from('comments')
    .update({ path: path ? `${path}/${data.id}` : `${data.id}` })
    .eq('id', data.id)

  return NextResponse.json({ comment: { ...data, path: path ? `${path}/${data.id}` : `${data.id}` } })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { id, text } = body

  if (!text?.trim()) return NextResponse.json({ error: 'Turinys tuščias' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('comments')
    .select('user_id, created_at, is_archived')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Komentaras nerastas' }, { status: 404 })
  if (existing.user_id !== session.user.id)
    return NextResponse.json({ error: 'Ne tavo komentaras' }, { status: 403 })
  if (existing.is_archived)
    return NextResponse.json({ error: 'Archyviniai komentarai neredaguojami' }, { status: 403 })

  const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 60000
  if (minutesAgo > EDIT_WINDOW_MINUTES)
    return NextResponse.json({ error: `Redaguoti galima tik ${EDIT_WINDOW_MINUTES} min. po parašymo` }, { status: 403 })

  const { data, error } = await supabase
    .from('comments')
    .update({ body: text.trim(), edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, body, edited_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const isAdmin = session.user.role === 'admin' || session.user.role === 'super_admin'

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', id!)
    .single()

  if (!existing) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })
  if (existing.user_id !== session.user.id && !isAdmin)
    return NextResponse.json({ error: 'Neleistina' }, { status: 403 })

  const { error } = await supabase
    .from('comments')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), body: '' })
    .eq('id', id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
