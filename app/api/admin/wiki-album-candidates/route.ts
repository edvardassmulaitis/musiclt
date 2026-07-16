/**
 * GET /api/admin/wiki-album-candidates?status=pending — sąrašas Wiki album
 * scout'o kandidatų (punktas B). Beveik visada bus 'pending' — atlikėjas
 * rastas kataloge, bet Wikipedia albumo straipsnis dar neatsirado (žr.
 * app/api/internal/wiki-album-scout/run/route.ts komentarą apie
 * wiki_album_candidates kaip dedupe/rescan atmintį).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '50', 10)

  const supabase = createAdminClient()

  const { data, error, count } = await supabase
    .from('wiki_album_candidates')
    .select(`
      id, source_url, artist_raw, album_title, album_wiki_link,
      release_year, release_month, release_day, genres_raw, label_raw,
      matched_artist_id, match_score, status, created_at, rescanned_at,
      matched_artist:artists!wiki_album_candidates_matched_artist_id_fkey(id, name, slug, cover_image_url)
    `, { count: 'exact' })
    .eq('status', status)
    .order('release_year', { ascending: false })
    .order('release_month', { ascending: false })
    .order('release_day', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ candidates: data || [], total: count || 0 })
}
