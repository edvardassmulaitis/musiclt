import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateAlbumScore } from '@/lib/scoring'

// GET /api/albums/[id]/score — public read
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data: album } = await supabase
    .from('albums')
    .select('score, score_breakdown, score_updated_at')
    .eq('id', id)
    .single()
  if (!album) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    score: album.score,
    breakdown: album.score_breakdown,
    updated_at: album.score_updated_at,
  })
}

// POST /api/albums/[id]/score — admin recalc + save
// Also accepts INTERNAL_API_SECRET header for backend-to-backend calls.
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
  const albumId = parseInt(id)
  const supabase = createAdminClient()

  const result = await calculateAlbumScore(supabase, albumId)

  const { error } = await supabase
    .from('albums')
    .update({
      score: result.final_score,
      score_breakdown: result.breakdown,
      score_updated_at: new Date().toISOString(),
    })
    .eq('id', albumId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    score: result.final_score,
    breakdown: result.breakdown,
    updated_at: new Date().toISOString(),
  })
}
