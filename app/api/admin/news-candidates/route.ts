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
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
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
  // 2026-06-25: ranking pagal artists.score (0-100), ne pagal legacy_likes.
  // Žemo-score (žinomų) atlikėjų naujienos paslepiamos, kad inbox'as nebūtų
  // užterštas low-interest grupėmis. ?all=1 apeina slėpimą (admin review).
  const SCORE_FLOOR = parseInt(process.env.NEWS_SCORE_FLOOR || '20', 10)
  const showAll = searchParams.get('all') === '1'

  const supabase = createAdminClient()

  // 2026-06-18: HARD-DELETE senienos (Edvardo sprendimas — savaitės threshold).
  // Naujiena senesnė nei 7d nebeaktuali → naikinam, kad nekauptų skaičiukų ir
  // nesimaišytų inbox'e. 'rejected' tombstone'ai paliekami (kad nebūtų re-scrape).
  // Publikuotos naujienos (blog_posts) NELIEČIAMOS. Idempotent kas GET.
  try {
    const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
    await supabase
      .from('news_candidates')
      .delete()
      .in('status', ['preview', 'pending', 'expired'])
      .lt('created_at', cutoff)
  } catch { /* non-fatal */ }

  // Fetch'inam platų pool'ą (created_at desc, ribota recency lange), o galutinį
  // rikiavimą pagal score + filtravimą darom in-app žemiau. fetchLimit > limit,
  // nes dalis kandidatų nukris po SCORE_FLOOR filtro.
  const fetchLimit = Math.min(Math.max(limit * 4, 80), 200)
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
    .limit(fetchLimit)

  if (category) q = q.eq('ai_category', category)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pakraunam VISUS suggested_artists kiekvienam candidate'ui (su image + score)
  const allArtistIds = new Set<number>()
  for (const c of (data || [])) {
    for (const id of (c.suggested_artist_ids || [])) allArtistIds.add(id)
  }
  let artistMap: Record<number, { id: number; name: string; slug: string; cover_image_url: string | null; legacy_likes: number | null; score: number | null }> = {}
  if (allArtistIds.size > 0) {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, legacy_likes, score')
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

  // Decorate per candidate'us + ranking pagal artists.score (0-100).
  //
  // rank = score_norm*0.6 + recency*0.3 + confidence*0.1  (0..1)
  //   • score_norm (60%): primary_artist.score / 100 — jūsų skaičiuotas
  //     all-time popularumas (pakeičia seną legacy_likes log10 proxy)
  //   • recency (30%):    14-d half-life exp decay nuo source_published_at
  //   • confidence (10%): AI pasitikėjimas
  //
  // artistScoreRaw (0-100) naudojamas SCORE_FLOOR slenksčiui. Jei atlikėjas
  // matched ir jo score < FLOOR → slepiam (low-interest žinoma grupė). Jei
  // atlikėjas NEmatched (null) → NEslepiam (gali būti dar nepririštas), bet
  // rikiuojam žemai. ?all=1 apeina slėpimą.
  const decoratedAll = (data || []).map((c: any) => {
    const artists = (c.suggested_artist_ids || [])
      .map((id: number) => artistMap[id])
      .filter(Boolean)
    const hasArtist = !!c.primary_artist
    const artistScoreRaw = hasArtist
      ? (c.primary_artist?.score ?? artists[0]?.score ?? 0)
      : null
    const scoreNorm = Math.min(1, Math.max(0, (artistScoreRaw ?? 0) / 100))
    const dateStr = c.source_published_at || c.created_at
    const ageDays = (Date.now() - new Date(dateStr).getTime()) / 86_400_000
    const recency = Math.max(0, Math.exp(-ageDays / 14))
    const confidence = c.ai_confidence ?? 0.5
    const rank = scoreNorm * 0.6 + recency * 0.3 + confidence * 0.1
    return {
      ...c,
      suggested_artists: artists,
      attachments: attachmentsMap[c.id] || [],
      _artistScoreRaw: artistScoreRaw,
      _hasArtist: hasArtist,
      score: Math.round(rank * 100) / 100,
      score_breakdown: {
        popularity: Math.round(scoreNorm * 100) / 100, // = artist score / 100
        recency: Math.round(recency * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        artist_score: artistScoreRaw == null ? null : Math.round(artistScoreRaw),
      },
    }
  })

  // SCORE_FLOOR filtras — slepiam tik matched žemo-score atlikėjus.
  const filtered = showAll
    ? decoratedAll
    : decoratedAll.filter((c: any) => !(c._hasArtist && (c._artistScoreRaw ?? 0) < SCORE_FLOOR))

  // Rikiuojam pagal rank desc, slice iki limit. Nuimam internal _ laukus.
  const decorated = filtered
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
    .map(({ _artistScoreRaw, _hasArtist, ...rest }: any) => rest)

  return NextResponse.json({
    candidates: decorated,
    total: decorated.length,
    pool: count || 0,
    hidden_low_score: showAll ? 0 : (decoratedAll.length - filtered.length),
  })
}
