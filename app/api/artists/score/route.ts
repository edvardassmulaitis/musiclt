import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calculateArtistScores } from '@/lib/scoring'

/**
 * POST /api/artists/score — Bulk recalculate scores for ALL artists
 * Returns { updated: number }
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !['admin', 'super_admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all active artist IDs
  const { data: artists, error: listErr } = await supabase
    .from('artists')
    .select('id')
    .eq('is_active', true)
    .order('id')

  if (listErr || !artists) {
    return NextResponse.json({ error: listErr?.message || 'No artists' }, { status: 500 })
  }

  let updated = 0

  for (const { id } of artists) {
    try {
      const { alltime, trending } = await calculateArtistScores(supabase, id)
      await supabase
        .from('artists')
        .update({
          score: alltime.final_score,
          score_override: alltime.score_override,
          score_breakdown: alltime,
          score_trending: trending.final_score,
          score_trending_breakdown: trending,
          score_updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      updated++
    } catch (e) {
      console.error(`[bulk-score] Failed for artist ${id}:`, e)
    }
  }

  return NextResponse.json({ updated, total: artists.length })
}
