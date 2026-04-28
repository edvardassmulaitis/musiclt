// app/api/tracks/[id]/lyric-comments/route.ts
//
// Lyric-line reactions API. Each row anchors to a (selection_start,
// selection_end, selected_text) span on the track lyrics + carries either
// a `like` reaction (no body) or a `comment` reaction (with text body).
//
// Authoring: when a logged-in user posts, we resolve their profile and write
// `user_id` so the GET handler can JOIN to profiles for the real avatar /
// display name. Falls back to legacy `author` + `avatar_letter` strings for
// rows without user_id (anonymous / pre-migration data).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveAuthorId } from '@/lib/resolve-author'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Try with user_id JOIN — falls back gracefully if migration 20260428 not
  // yet applied (column missing → "could not find column" error).
  let { data, error } = await supabase
    .from('track_lyric_comments')
    .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at, user_id, author, avatar_letter, profiles:user_id(username, full_name, avatar_url)')
    .eq('track_id', id)
    .order('created_at', { ascending: true }) as { data: any; error: any }

  if (error && /user_id|profiles|relationship/i.test(error.message)) {
    const fb = await supabase
      .from('track_lyric_comments')
      .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at, author, avatar_letter')
      .eq('track_id', id)
      .order('created_at', { ascending: true })
    data = fb.data
    error = fb.error
  }

  if (error) {
    console.error('[lyric-comments GET]', error.message)
    return NextResponse.json([])
  }

  const out = (data ?? []).map((r: any) => ({
    id: r.id,
    selection_start: r.selection_start,
    selection_end: r.selection_end,
    selected_text: r.selected_text,
    type: r.type,
    text: r.text,
    likes: r.likes,
    created_at: r.created_at,
    // Display fields — prefer profile JOIN, fall back to legacy strings.
    author_name: r.profiles?.full_name || r.profiles?.username || r.author || 'Vartotojas',
    author_avatar_url: r.profiles?.avatar_url || null,
    author_initial: (r.profiles?.full_name || r.profiles?.username || r.author || '?').trim().charAt(0).toUpperCase() || '?',
  }))

  return NextResponse.json(out)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  const { selected_text, selection_start, selection_end, type, text } = body

  if (!selected_text || selection_start === undefined || selection_end === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Resolve current user via shared resolver — handles JWT staleness +
  // wiped profiles by recreating the row. If unauthenticated, fall back
  // to anonymous (legacy author, no user_id).
  const session = await getServerSession(authOptions)
  let userId: string | null = await resolveAuthorId(supabase, session)
  let displayAuthor = 'Anonimas'
  let avatarLetter = 'A'
  if (userId) {
    displayAuthor = session?.user?.name || 'Vartotojas'
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', userId)
      .maybeSingle()
    if (profile) {
      displayAuthor = profile.full_name || profile.username || displayAuthor
    }
    avatarLetter = displayAuthor.trim().charAt(0).toUpperCase() || '?'
  }

  const insertRow: any = {
    track_id: Number(id),
    selected_text: String(selected_text),
    selection_start: Number(selection_start),
    selection_end: Number(selection_end),
    type: String(type ?? 'like'),
    text: String(text ?? ''),
    likes: 0,
    author: displayAuthor,
    avatar_letter: avatarLetter,
  }
  if (userId) insertRow.user_id = userId

  let { data, error } = await supabase
    .from('track_lyric_comments')
    .insert(insertRow)
    .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at, user_id, author, avatar_letter')
    .single() as { data: any; error: any }

  // Migration not yet applied? Drop user_id and retry.
  if (error && /user_id/i.test(error.message)) {
    delete insertRow.user_id
    const fb = await supabase
      .from('track_lyric_comments')
      .insert(insertRow)
      .select('id, selection_start, selection_end, selected_text, type, text, likes, created_at, author, avatar_letter')
      .single()
    data = fb.data
    error = fb.error
  }

  if (error) {
    console.error('[lyric-comments POST]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

/** DELETE /api/tracks/[id]/lyric-comments?reaction_id=N
 *  Allowed for the reaction's author OR admin/super_admin. Hard delete —
 *  there's no soft-delete column on track_lyric_comments yet, and these
 *  rows are short-lived signals anyway. */
export async function DELETE(
  req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const reactionId = parseInt(searchParams.get('reaction_id') || '')
  if (!reactionId) {
    return NextResponse.json({ error: 'Reikia reaction_id' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const userId = await resolveAuthorId(supabase, session)
  const role = (session.user as any).role
  const isAdmin = role === 'admin' || role === 'super_admin'

  const { data: row } = await supabase
    .from('track_lyric_comments')
    .select('id, user_id')
    .eq('id', reactionId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Nerastas' }, { status: 404 })
  if (!isAdmin && row.user_id !== userId) {
    return NextResponse.json({ error: 'Neleistina' }, { status: 403 })
  }

  const { error } = await supabase.from('track_lyric_comments').delete().eq('id', reactionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
