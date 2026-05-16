/**
 * Admin endpoint candidate'ams sąraše.
 *
 * GET /api/admin/news-candidates?status=pending&limit=50
 *   → grąžina pending kandidatus su artist preview info'ja
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return null
  }
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const category = searchParams.get('category')

  const supabase = createAdminClient()

  // Sort by NEWEST first (created_at desc) — kandidatai chronologiškai.
  // ai_confidence palieka kaip tie-breaker'is ant tos pačios dienos kandidatų.
  let q = supabase
    .from('news_candidates')
    .select(`
      id, source_type, source_portal, source_url, source_email_from,
      ai_category, ai_title, ai_summary, ai_confidence, ai_model,
      suggested_artist_ids, suggested_track_ids, primary_artist_id,
      suggested_image_url, status, filter_reason, reject_reason,
      created_at, source_published_at, ai_tracks_mentioned, embed_urls,
      primary_artist:artists!news_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url, legacy_likes)
    `, { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('ai_confidence', { ascending: false })
    .limit(limit)

  if (category) q = q.eq('ai_category', category)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pakraunam VISUS suggested_artists kiekvienam candidate'ui (su image + score)
  const allArtistIds = new Set<number>()
  for (const c of (data || [])) {
    for (const id of (c.suggested_artist_ids || [])) allArtistIds.add(id)
  }
  let artistMap: Record<number, { id: number; name: string; slug: string; cover_image_url: string | null; legacy_likes: number | null }> = {}
  if (allArtistIds.size > 0) {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, legacy_likes')
      .in('id', Array.from(allArtistIds))
    for (const a of (artists || [])) {
      artistMap[a.id] = a as any
    }
  }

  // Decorate per candidate'us su pilna suggested_artists info'ja + score'u.
  //
  // Naujas score = popularity × recency × ai_confidence:
  //   - popularity (0..1): primary_artist.legacy_likes normalized (log scale,
  //     1000 likes ≈ 0.5, 10000 ≈ 0.8, 100000+ ≈ 1.0)
  //   - recency (0..1): source_published_at amžius dienomis — exp decay
  //     (1 d. = 0.95, 7 d. = 0.7, 30 d. = 0.3, 90+ d. ≈ 0)
  //   - ai_confidence (0..1): AI'aus pasitikėjimas
  // Score'as rodomas card'oje kaip ⭐ 0.XX (pakeitė buvusį ai_confidence).
  const decorated = (data || []).map((c: any) => {
    const artists = (c.suggested_artist_ids || [])
      .map((id: number) => artistMap[id])
      .filter(Boolean)
    // Popularity — primary artist likes, log10-scaled
    const primaryLikes = c.primary_artist?.legacy_likes ?? artists[0]?.legacy_likes ?? 0
    const popularity = primaryLikes > 0
      ? Math.min(1, Math.log10(primaryLikes + 1) / 5) // 100k+ likes ≈ 1.0
      : 0.1
    // Recency — dienos nuo source_published_at (fallback created_at)
    const dateStr = c.source_published_at || c.created_at
    const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86_400_000
    const recency = Math.max(0, Math.exp(-ageDays / 14)) // 14d half-life
    const confidence = c.ai_confidence ?? 0.5
    const score = popularity * recency * confidence
    return {
      ...c,
      suggested_artists: artists,
      score: Math.round(score * 100) / 100,
      score_breakdown: {
        popularity: Math.round(popularity * 100) / 100,
        recency: Math.round(recency * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
      },
    }
  })

  return NextResponse.json({
    candidates: decorated,
    total: count || 0,
  })
}
