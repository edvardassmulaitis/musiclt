/**
 * GET /api/admin/event-candidates?status=pending — list pending event candidates
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

  // 2026-06-11: auto-expire senienos (kaupėsi šimtai pending event'ų):
  //   1) renginiai, kurių data jau praėjo (vakar ir anksčiau)
  //   2) renginiai be datos, scrapinti prieš >45d (nebepataisysi — pasenę)
  // Idempotent UPDATE'ai kiekvieno list GET'o metu.
  try {
    const today = new Date().toISOString().slice(0, 10)
    await supabase
      .from('event_candidates')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('event_date', today)
    const staleCutoff = new Date(Date.now() - 45 * 86_400_000).toISOString()
    await supabase
      .from('event_candidates')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .is('event_date', null)
      .lt('created_at', staleCutoff)
  } catch { /* non-fatal */ }

  // Sort by newest scraped (created_at DESC) — matches news inbox semantic.
  // Anksciau buvo event_date ASC (artimiausias renginys pirma) — ta sortavimas
  // gerai end-user'iui, bet adminui review'ui geriau matyti naujausius scraped.
  const { data, error, count } = await supabase
    .from('event_candidates')
    .select(`
      id, source_type, source_portal, source_url,
      title, event_date, event_date_text, venue_name_raw, city,
      description, ticket_url, price_text, image_url,
      suggested_artist_ids, primary_artist_id,
      status, fingerprint, ai_confidence, created_at,
      primary_artist:artists!event_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url, legacy_likes)
    `, { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('ai_confidence', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Decorate su suggested_artists (image + likes) + score formula (weighted avg).
  const allArtistIds = new Set<number>()
  for (const c of (data || [])) {
    for (const id of (c.suggested_artist_ids || [])) allArtistIds.add(id)
  }
  let artistMap: Record<number, any> = {}
  if (allArtistIds.size > 0) {
    const { data: artists } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url, legacy_likes')
      .in('id', Array.from(allArtistIds))
    for (const a of (artists || [])) artistMap[a.id] = a
  }

  const decorated = (data || []).map((c: any) => {
    const artists = (c.suggested_artist_ids || []).map((id: number) => artistMap[id]).filter(Boolean)
    // Score = popularity (artist likes) * 0.4 + recency (event_date or created_at) * 0.4 + confidence * 0.2
    const primaryLikes = c.primary_artist?.legacy_likes ?? artists[0]?.legacy_likes ?? 0
    const popularity = primaryLikes > 0
      ? Math.min(1, Math.log10(primaryLikes + 1) / 5)
      : 0.2
    // Recency — events naudoja event_date (kada renginys vyks). Jei renginys
    // jau praėjo — recency=0 (atmesti). Jei rytoj — 1.0, po mėnesio — 0.5.
    let recency = 0.5 // default jeigu nėra event_date
    if (c.event_date) {
      const eventMs = new Date(c.event_date).getTime()
      const nowMs = Date.now()
      if (eventMs < nowMs) {
        recency = 0 // event praėjo
      } else {
        const daysUntil = (eventMs - nowMs) / 86_400_000
        // 14d horizon — 1.0 jei rytoj, 0.5 po 14d, ~0 po 60d
        recency = Math.max(0, Math.min(1, Math.exp(-daysUntil / 30)))
      }
    }
    const confidence = c.ai_confidence ?? 0.5
    const score = popularity * 0.4 + recency * 0.4 + confidence * 0.2
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

  return NextResponse.json({ candidates: decorated, total: count || 0 })
}
