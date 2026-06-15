// GET /api/studija/social-items?artistId=&platform= — vieši sukešuoti auto-feed įrašai.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const artistId = Number(sp.get('artistId'))
  const platform = sp.get('platform')
  if (!Number.isFinite(artistId) || artistId <= 0) return NextResponse.json({ items: [] })
  try {
    const sb = createAdminClient()
    let q = sb.from('artist_social_items')
      .select('id, platform, external_id, kind, url, media_url, thumb_url, caption, published_at')
      .eq('artist_id', artistId)
    if (platform) q = q.eq('platform', platform)
    const { data } = await q.order('published_at', { ascending: false }).limit(12)
    return NextResponse.json({ items: data || [] })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
