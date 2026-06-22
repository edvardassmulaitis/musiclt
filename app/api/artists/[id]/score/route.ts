import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateArtistScores } from '@/lib/scoring'

// ── GET /api/artists/[id]/score ──────────────────────────────
// Returns current score breakdown (from DB if cached, or computes fresh)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: artist } = await supabase
    .from('artists')
    .select('score, score_override, score_breakdown, score_trending, score_trending_breakdown, score_updated_at')
    .eq('id', id)
    .single()

  if (!artist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    score: artist.score,
    score_override: artist.score_override || 0,
    breakdown: artist.score_breakdown,
    score_trending: artist.score_trending,
    trending_breakdown: artist.score_trending_breakdown,
    updated_at: artist.score_updated_at,
  })
}

// ── POST /api/artists/[id]/score ─────────────────────────────
// Recalculate score from current data and save to DB
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const artistId = parseInt(id)
  const supabase = createAdminClient()

  const { alltime, trending } = await calculateArtistScores(supabase, artistId)

  // Save to DB — kanoninis `score` = ALL-TIME, plius atskiras trending.
  const { error } = await supabase
    .from('artists')
    .update({
      score: alltime.final_score,
      score_override: alltime.score_override,
      score_breakdown: alltime,
      score_trending: trending.final_score,
      score_trending_breakdown: trending,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    score: alltime.final_score,
    score_override: alltime.score_override,
    breakdown: alltime,
    score_trending: trending.final_score,
    trending_breakdown: trending,
    updated_at: new Date().toISOString(),
  })
}

// ── PATCH /api/artists/[id]/score ────────────────────────────
// Update score_override and recalculate final score
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const artistId = parseInt(id)
  const body = await req.json()
  const newOverride = Math.max(-15, Math.min(15, parseInt(body.score_override) || 0))

  const supabase = createAdminClient()

  // Set the override first
  await supabase
    .from('artists')
    .update({ score_override: newOverride })
    .eq('id', artistId)

  // Recalculate with new override — abu reitingai (bonusas taikomas abiem).
  const { alltime, trending } = await calculateArtistScores(supabase, artistId)

  // Save
  const { error } = await supabase
    .from('artists')
    .update({
      score: alltime.final_score,
      score_breakdown: alltime,
      score_trending: trending.final_score,
      score_trending_breakdown: trending,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    score: alltime.final_score,
    score_override: newOverride,
    breakdown: alltime,
    score_trending: trending.final_score,
    trending_breakdown: trending,
    updated_at: new Date().toISOString(),
  })
}
