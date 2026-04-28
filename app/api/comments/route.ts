// app/api/comments/route.ts
//
// Modern user-editable comments backing CommentsSection / EntityCommentsBlock.
//
// `comments` table actually uses separate FK columns per entity type
// (track_id, album_id, news_id, event_id). This API translates an
// `entity_type` + `entity_id` request from the client to the right column,
// so the consumer doesn't have to know the storage layout. Author display
// info (name + avatar) is resolved via JOIN to `profiles` so we don't have
// to denormalize on insert.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const EDIT_WINDOW_MINUTES = 20

type EntityType = 'track' | 'album' | 'news' | 'event'

const ENTITY_COL: Record<EntityType, 'track_id' | 'album_id' | 'news_id' | 'event_id'> = {
  track: 'track_id',
  album: 'album_id',
  news: 'news_id',
  event: 'event_id',
}

function entityCol(t: string | null): 'track_id' | 'album_id' | 'news_id' | 'event_id' | null {
  if (!t) return null
  return ENTITY_COL[t as EntityType] ?? null
}

async function resolveAuthorId(
  sb: ReturnType<typeof createAdminClient>,
  email: string | null | undefined,
): Promise<string | null> {
  if (!email) return null
  const { data } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
  return data?.id ?? null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const entityType = searchParams.get('entity_type')
  const entityId = searchParams.get('entity_id')
  const sort = searchParams.get('sort') || 'newest' // newest | oldest | popular
  const limit = parseInt(searchParams.get('limit') || '100')

  const col = entityCol(entityType)
  if (!col || !entityId) return NextResponse.json({ comments: [] })

  const sb = createAdminClient()

  // SELECT comments + JOIN profiles tam, kad gautume author display info.
  // Profile'os fk yra `author_id` (uuid → profiles.id).
  let query = sb
    .from('comments')
    .select('id, parent_id, author_id, body, like_count, reported_count, is_deleted, created_at, updated_at, profiles:author_id(username, full_name, avatar_url)')
    .eq(col, parseInt(entityId))
    .limit(limit)

  if (sort === 'oldest') query = query.order('created_at', { ascending: true })
  else if (sort === 'popular') query = query.order('like_count', { ascending: false }).order('created_at', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sanitize + normalize for client. Soft-deleted comments hide their body.
  const sanitized = (data || []).map((c: any) => ({
    id: c.id,
    parent_id: c.parent_id,
    user_id: c.author_id,
    author_name: c.is_deleted ? null : (c.profiles?.full_name || c.profiles?.username || 'Vartotojas'),
    author_avatar: c.is_deleted ? null : (c.profiles?.avatar_url || null),
    body: c.is_deleted ? '[Komentaras pašalintas]' : c.body,
    like_count: c.like_count || 0,
    reported_count: c.reported_count || 0,
    is_deleted: c.is_deleted,
    created_at: c.created_at,
    edited_at: c.updated_at && c.updated_at !== c.created_at ? c.updated_at : null,
  }))

  return NextResponse.json({ comments: sanitized })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }

  const body = await req.json()
  const { entity_type, entity_id, parent_id, text } = body

  if (!text?.trim() || text.trim().length < 2)
    return NextResponse.json({ error: 'Komentaras per trumpas' }, { status: 400 })
  if (text.trim().length > 5000)
    return NextResponse.json({ error: 'Komentaras per ilgas (max 5000)' }, { status: 400 })

  const col = entityCol(entity_type)
  if (!col || !entity_id) return NextResponse.json({ error: 'Bloga entity reikšmė' }, { status: 400 })

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session.user.email)
  if (!authorId) {
    return NextResponse.json({ error: 'Tavo profilis dar nesukurtas — atsijunk ir prisijunk iš naujo' }, { status: 500 })
  }

  // Validate parent_id (if reply) belongs to same entity.
  if (parent_id) {
    const { data: parent } = await sb
      .from('comments')
      .select('id, ' + col)
      .eq('id', parent_id)
      .single()
    if (!parent || (parent as any)[col] !== parseInt(entity_id))
      return NextResponse.json({ error: 'Tėvinis komentaras nerastas' }, { status: 404 })
  }

  const insertRow: any = {
    [col]: parseInt(entity_id),
    parent_id: parent_id || null,
    author_id: authorId,
    body: text.trim(),
  }
  const { data, error } = await sb
    .from('comments')
    .insert(insertRow)
    .select('id, parent_id, author_id, body, like_count, created_at, updated_at, profiles:author_id(username, full_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const c: any = data
  return NextResponse.json({
    comment: {
      id: c.id,
      parent_id: c.parent_id,
      user_id: c.author_id,
      author_name: c.profiles?.full_name || c.profiles?.username || 'Vartotojas',
      author_avatar: c.profiles?.avatar_url || null,
      body: c.body,
      like_count: c.like_count || 0,
      created_at: c.created_at,
      edited_at: null,
    },
  })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const body = await req.json()
  const { id, text } = body

  if (!text?.trim()) return NextResponse.json({ error: 'Turinys tuščias' }, { status: 400 })

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session.user.email)
  if (!authorId) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  const { data: existing } = await sb
    .from('comments')
    .select('author_id, created_at, is_deleted')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Komentaras nerastas' }, { status: 404 })
  if (existing.author_id !== authorId)
    return NextResponse.json({ error: 'Ne tavo komentaras' }, { status: 403 })
  if (existing.is_deleted)
    return NextResponse.json({ error: 'Pašalinti komentarai neredaguojami' }, { status: 403 })

  const minutesAgo = (Date.now() - new Date(existing.created_at).getTime()) / 60000
  if (minutesAgo > EDIT_WINDOW_MINUTES)
    return NextResponse.json({ error: `Redaguoti galima tik ${EDIT_WINDOW_MINUTES} min. po parašymo` }, { status: 403 })

  const { data, error } = await sb
    .from('comments')
    .update({ body: text.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, body, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: { id: data.id, body: data.body, edited_at: data.updated_at } })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email)
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const role = (session.user as any).role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const sb = createAdminClient()
  const authorId = await resolveAuthorId(sb, session.user.email)
  if (!authorId && !isAdmin) return NextResponse.json({ error: 'Profilis nerastas' }, { status: 500 })

  const { data: existing } = await sb
    .from('comments')
    .select('author_id')
    .eq('id', id!)
    .single()

  if (!existing) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })
  if (existing.author_id !== authorId && !isAdmin)
    return NextResponse.json({ error: 'Neleistina' }, { status: 403 })

  const { error } = await sb
    .from('comments')
    .update({ is_deleted: true, body: '' })
    .eq('id', id!)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
