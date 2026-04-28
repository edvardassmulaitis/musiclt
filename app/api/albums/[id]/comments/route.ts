// app/api/albums/[id]/comments/route.ts
//
// Music.lt entity_comments albumui. Mirror'as /api/tracks/[id]/comments —
// resolve'inam legacy_id iš modern PK, tada query'inam scraped komentarus
// iš entity_comments lentelės. Naudojama album page komentarų sekcijoje.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

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

  const { data, error } = await sb
    .from('entity_comments')
    .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count')
    .eq('entity_type', 'album')
    .eq('entity_legacy_id', albumRow.legacy_id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ comments: data || [] })
}
