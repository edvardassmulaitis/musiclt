// app/api/albums/[id]/comments/route.ts
//
// Music.lt entity_comments albumui. Mirror /api/tracks/[id]/comments —
// resolve legacy_id iš modern PK, tada query scraped comments. DELETE
// admin'ams soft-hides a row.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const albumId = parseInt(id)
  if (isNaN(albumId)) {
    return NextResponse.json({ error: 'Invalid album id' }, { status: 400 })
  }
  const sb = createAdminClient()

  const { data: albumRow } = await sb
    .from('albums')
    .select('legacy_id')
    .eq('id', albumId)
    .maybeSingle()
  if (!albumRow?.legacy_id) {
    return NextResponse.json({ comments: [] })
  }

  let { data, error } = await sb
    .from('entity_comments')
    .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count, is_hidden')
    .eq('entity_type', 'album')
    .eq('entity_legacy_id', albumRow.legacy_id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .order('created_at', { ascending: true })
    .limit(200) as { data: any; error: any }

  if (error && /is_hidden/i.test(error.message)) {
    const fb = await sb
      .from('entity_comments')
      .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count')
      .eq('entity_type', 'album')
      .eq('entity_legacy_id', albumRow.legacy_id)
      .order('created_at', { ascending: true })
      .limit(200)
    data = fb.data
    error = fb.error
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ comments: data || [] })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  if (!isAdmin) {
    return NextResponse.json({ error: 'Reikia admin teisių' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const legacyId = parseInt(searchParams.get('legacy_id') || '')
  if (!legacyId) {
    return NextResponse.json({ error: 'Reikia legacy_id' }, { status: 400 })
  }
  const sb = createAdminClient()
  const { error } = await sb
    .from('entity_comments')
    .update({ is_hidden: true })
    .eq('legacy_id', legacyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
