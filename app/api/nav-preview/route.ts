// app/api/nav-preview/route.ts
//
// Vienas endpoint'as nav dropdown'ams — atveža:
//   - top atlikėjus (Muzika dropdown)
//   - latest albumus (Muzika dropdown)
//   - upcoming renginius (Renginiai dropdown)
//   - latest naujienas (Bendruomenė dropdown)
//
// Cache'inta agresyviai (s-maxage=300) — nav preview keičiasi retai.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()

  try {
    const [artistsRes, albumsRes, eventsRes, newsRes] = await Promise.all([
      // Top 6 atlikėjų pagal score
      supabase
        .from('artists')
        .select('id, slug, name, cover_image_url')
        .not('score', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(6),

      // 6 naujausių albumų
      supabase
        .from('albums')
        .select('id, slug, title, cover_image_url, year, artists!albums_artist_id_fkey(name)')
        .not('cover_image_url', 'is', null)
        .order('year', { ascending: false, nullsFirst: false })
        .order('month', { ascending: false, nullsFirst: false })
        .limit(6),

      // 4 artimiausi renginiai
      supabase
        .from('events')
        .select('id, slug, title, start_date, venue_name, cover_image_url')
        .in('status', ['upcoming', 'ongoing'])
        .order('start_date', { ascending: true })
        .limit(4),

      // 4 naujausios naujienos
      supabase
        .from('news')
        .select('id, slug, title, image_small_url, published_at')
        .order('published_at', { ascending: false })
        .limit(4),
    ])

    const payload = {
      artists: (artistsRes.data || []).map(a => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        image: a.cover_image_url,
      })),
      albums: (albumsRes.data || []).map((a: any) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        image: a.cover_image_url,
        year: a.year,
        artist: a.artists?.name || '',
      })),
      events: (eventsRes.data || []).map(e => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        date: e.start_date,
        venue: e.venue_name,
        image: e.cover_image_url,
      })),
      news: (newsRes.data || []).map(n => ({
        id: n.id,
        slug: n.slug,
        title: n.title,
        image: n.image_small_url,
        date: n.published_at,
      })),
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control':            'public, s-maxage=300, stale-while-revalidate=900',
        'CDN-Cache-Control':        'public, s-maxage=300, stale-while-revalidate=900',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
