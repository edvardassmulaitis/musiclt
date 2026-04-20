import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateArtistScore } from '@/lib/scoring'

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
    .select('score, score_override, score_breakdown, score_updated_at')
    .eq('id', id)
    .single()

  if (!artist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    score: artist.score,
    score_override: artist.score_override || 0,
    breakdown: artist.score_breakdown,
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

  const breakdown = await calculateArtistScore(supabase, artistId)

  // Save to DB
  const { error } = await supabase
    .from('artists')
    .update({
      score: breakdown.final_score,
      score_override: breakdown.score_override,
      score_breakdown: breakdown,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    score: breakdown.final_score,
    score_override: breakdown.score_override,
    breakdown,
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

  // Recalculate with new override
  const breakdown = await calculateArtistScore(supabase, artistId)

  // Save
  const { error } = await supabase
    .from('artists')
    .update({
      score: breakdown.final_score,
      score_breakdown: breakdown,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', artistId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    score: breakdown.final_score,
    score_override: newOverride,
    breakdown,
    updated_at: new Date().toISOString(),
  })
}
