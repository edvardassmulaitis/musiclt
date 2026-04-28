// app/api/tracks/[id]/comments/route.ts
//
// Music.lt entity_comments dainai. GET — naudojama TrackInfoModal /
// EntityCommentsBlock'e, kad rodytų archyvinių komentarų sąrašą.
// DELETE — admin'ams (super_admin / admin role) leidžia paslėpti
// scrape'intą komentarą (is_hidden=true). Soft-delete; tik UI filtruojame.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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

  const { data: trackRow } = await sb
    .from('tracks')
    .select('legacy_id')
    .eq('id', trackId)
    .maybeSingle()
  if (!trackRow?.legacy_id) {
    return NextResponse.json({ comments: [] })
  }

  // Try with is_hidden filter first; fall back if migration not yet applied.
  let { data, error } = await sb
    .from('entity_comments')
    .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count, is_hidden')
    .eq('entity_type', 'track')
    .eq('entity_legacy_id', trackRow.legacy_id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .order('created_at', { ascending: true })
    .limit(200) as { data: any; error: any }

  if (error && /is_hidden/i.test(error.message)) {
    const fb = await sb
      .from('entity_comments')
      .select('legacy_id, author_username, author_avatar_url, created_at, content_text, content_html, like_count')
      .eq('entity_type', 'track')
      .eq('entity_legacy_id', trackRow.legacy_id)
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

/** DELETE /api/tracks/[id]/comments?legacy_id=N — admin-only soft-hide of
 *  a scraped legacy comment. Sets entity_comments.is_hidden = true. */
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
