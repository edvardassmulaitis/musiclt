// app/api/tracks/[id]/comments/route.ts
//
// Music.lt entity_comments dainai. Naudojama TrackInfoModal komponente
// (artist'o page'o slide-out drawer'is), kad rodytų komentarų sąrašą be
// pilno track puslapio load'inimo.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const trackId = parseInt(id)
  if (isNaN(trackId)) {
    return NextResponse.json({ error: 'Invalid track id' }, { status: 400 })
  }
  const sb = createAdminClient()

  // Resolve legacy_id iš tracks PK
  const { data: trackRow } = await sb
    .from('tracks')
    .select('legacy_id')
    .eq('id', trackId)
    .maybeSingle()
  if (!trackRow?.legacy_id) {
    return NextResponse.json({ comments: [] })
  }

  const { data, error } = await sb
    .from('entity_comments')
    .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count')
    .eq('entity_type', 'track')
    .eq('entity_legacy_id', trackRow.legacy_id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ comments: data || [] })
}
