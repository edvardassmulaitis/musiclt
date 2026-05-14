/**
 * Image picker per candidate'ą.
 *
 * GET — grąžina available image options:
 *   - artist_photos (jeigu yra primary_artist_id)
 *   - artist.cover_image_url
 *   - source candidate.suggested_image_url
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) return NextResponse.json({ error: 'Bad ID' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: cand, error } = await supabase
    .from('news_candidates')
    .select('id, primary_artist_id, suggested_artist_ids, suggested_image_url')
    .eq('id', candidateId)
    .single()
  if (error || !cand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const options: Array<{ url: string; label: string; source: string }> = []

  // 1) Auto-pick'as: naujausi artist_photos (per primary arba pirmas iš suggested)
  const primaryArtistId = cand.primary_artist_id || (cand.suggested_artist_ids?.[0] as number | undefined)
  if (primaryArtistId) {
    const { data: artist } = await supabase
      .from('artists')
      .select('name, cover_image_url')
      .eq('id', primaryArtistId)
      .maybeSingle()

    const { data: photos } = await supabase
      .from('artist_photos')
      .select('url, caption, sort_order')
      .eq('artist_id', primaryArtistId)
      .order('sort_order', { ascending: true })
      .limit(8)

    if (photos && photos.length > 0) {
      for (const p of photos) {
        if (!p.url) continue
        options.push({
          url: p.url,
          label: p.caption || artist?.name || 'atlikėjo nuotrauka',
          source: 'artist_photo',
        })
      }
    }
    if (artist?.cover_image_url) {
      // Tik jei nėra dublikato su photos
      if (!options.some(o => o.url === artist.cover_image_url)) {
        options.push({
          url: artist.cover_image_url,
          label: `${artist.name} (cover)`,
          source: 'artist_cover',
        })
      }
    }
  }

  // 2) Source image — kaip last resort fallback'as
  if (cand.suggested_image_url) {
    options.push({
      url: cand.suggested_image_url,
      label: 'iš source straipsnio',
      source: 'source',
    })
  }

  return NextResponse.json({
    options,
    artist_id: primaryArtistId || null,
  })
}
