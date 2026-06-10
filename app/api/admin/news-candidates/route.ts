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
  const statusRaw = searchParams.get('status') || 'pending'
  // 2026-05-20: status accepta comma-separated ('preview,pending') Tier 1 / Tier 2
  // candidate'ams paimti vienu užklausimu.
  const statusList = statusRaw.split(',').map(s => s.trim()).filter(Boolean)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const category = searchParams.get('category')

  const supabase = createAdminClient()

  // 2026-06-11: auto-expire senienos — preview/pending kandidatai senesni nei
  // 30d nebeaktualūs (naujiena pasenusi), žymim 'expired' kad nekauptų
  // skaičiukų ir nesimaišytų inbox'e. Pigus UPDATE su filtru, vykdomas
  // kiekvieno list GET'o metu (idempotent).
  try {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
    await supabase
      .from('news_candidates')
      .update({ status: 'expired' })
      .in('status', ['preview', 'pending'])
      .lt('created_at', cutoff)
  } catch { /* non-fatal */ }

  // Sort by NEWEST first (created_at desc) — kandidatai chronologiškai.
  // ai_confidence palieka kaip tie-breaker'is ant tos pačios dienos kandidatų.
  let q = supabase
    .from('news_candidates')
    .select(`
      id, source_type, source_portal, source_url, source_email_from,
      ai_category, ai_title, ai_summary, ai_confidence, ai_model,
      original_title,
      suggested_artist_ids, suggested_track_ids, primary_artist_id,
      suggested_image_url, status, filter_reason, reject_reason,
      created_at, source_published_at, ai_tracks_mentioned, embed_urls,
      primary_artist:artists!news_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url, legacy_likes, score)
    `, { count: 'exact' })
    .in('status', statusList)
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

  // Pakraunam attachment'us (foto + EXIF metadata) — preview kortelėj rodysim
  // pirmuosius 3 thumbnails. Visi attachment'ai rendinami kortelės expanded view'e.
  const allCandidateIds = (data || []).map(c => c.id)
  let attachmentsMap: Record<number, Array<{ id: number; public_url: string; photographer: string | null; copyright: string | null; year_taken: number | null; caption: string | null; sort_order: number }>> = {}
  if (allCandidateIds.length > 0) {
    const { data: imgs } = await supabase
      .from('news_candidate_images')
      .select('id, candidate_id, public_url, photographer, copyright, year_taken, caption, photographer_override, copyright_override, year_override, sort_order')
      .in('candidate_id', allCandidateIds)
      .order('sort_order', { ascending: true })
    for (const i of (imgs || []) as any[]) {
      const list = (attachmentsMap[i.candidate_id] ||= [])
      list.push({
        id: i.id,
        public_url: i.public_url,
        photographer: i.photographer_override || i.photographer,
        copyright: i.copyright_override || i.copyright,
        year_taken: i.year_override || i.year_taken,
        caption: i.caption,
        sort_order: i.sort_order,
      })
    }
  }

  // Decorate per candidate'us su pilna suggested_artists info'ja + score'u.
  //
  // Score = weighted average (NE multiplication — anksciau buvo P×R×C kuris
  // duodavo 0.04-0.32 scale'ą, vizualiai per žema):
  //   • popularity (40%): primary_artist.legacy_likes log10-scale
  //     (100 likes ≈ 0.4, 1000 ≈ 0.6, 10k ≈ 0.8, 100k+ ≈ 1.0)
  //   • recency (40%):    14-day half-life exp decay nuo source_published_at
  //     (today=1.0, 1d=0.93, 7d=0.61, 30d=0.12)
  //   • confidence (20%): AI'aus pasitikėjimas (0.5..0.95 typical)
  //
  // Praktiškai score'ai dabar 0.40-0.85 range — vizualiai aiškiau. Tooltip
  // tooltip'e rodo breakdown.
  const decorated = (data || []).map((c: any) => {
    const artists = (c.suggested_artist_ids || [])
      .map((id: number) => artistMap[id])
      .filter(Boolean)
    const primaryLikes = c.primary_artist?.legacy_likes ?? artists[0]?.legacy_likes ?? 0
    const popularity = primaryLikes > 0
      ? Math.min(1, Math.log10(primaryLikes + 1) / 5)
      : 0.2 // baseline jeigu visai nėra likes
    const dateStr = c.source_published_at || c.created_at
    const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86_400_000
    const recency = Math.max(0, Math.exp(-ageDays / 14))
    const confidence = c.ai_confidence ?? 0.5
    // Weighted average
    const score = popularity * 0.4 + recency * 0.4 + confidence * 0.2
    return {
      ...c,
      suggested_artists: artists,
      attachments: attachmentsMap[c.id] || [],
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
