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

  let q = supabase
    .from('news_candidates')
    .select(`
      id, source_type, source_portal, source_url, source_email_from,
      ai_category, ai_title, ai_summary, ai_confidence, ai_model,
      suggested_artist_ids, suggested_track_ids, primary_artist_id,
      suggested_image_url, status, filter_reason, reject_reason,
      created_at,
      primary_artist:artists!news_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url, legacy_likes)
    `, { count: 'exact' })
    .eq('status', status)
    .order('ai_confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category) q = q.eq('ai_category', category)

  const { data, error, count } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    candidates: data || [],
    total: count || 0,
  })
}
