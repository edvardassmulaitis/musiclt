import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateTrackScore } from '@/lib/scoring'

// GET /api/tracks/[id]/score — public read
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data: track } = await supabase
    .from('tracks')
    .select('score, score_breakdown, score_updated_at')
    .eq('id', id)
    .single()
  if (!track) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    score: track.score,
    breakdown: track.score_breakdown,
    updated_at: track.score_updated_at,
  })
}

// POST /api/tracks/[id]/score — admin recalc + save
// Also accepts INTERNAL_API_SECRET for backend calls.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const isAdmin = session?.user?.role && ['admin', 'super_admin'].includes(session.user.role)
  const secret = req.headers.get('x-internal-secret')
  const isInternal = !!secret && secret === process.env.INTERNAL_API_SECRET
  if (!isAdmin && !isInternal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const trackId = parseInt(id)
  const supabase = createAdminClient()

  const result = await calculateTrackScore(supabase, trackId)

  const { error } = await supabase
    .from('tracks')
    .update({
      score: result.final_score,
      score_breakdown: result.breakdown,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', trackId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    score: result.final_score,
    breakdown: result.breakdown,
    updated_at: new Date().toISOString(),
  })
}
