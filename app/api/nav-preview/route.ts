// app/api/nav-preview/route.ts
//
// Vienas endpoint'as nav dropdown'ams — atveža:
//   - top atlikėjus (LT + world) Muzikos dropdown'ui
//   - latest albumus
//   - latest dainas (trending strip Muzikos dropdown'e)
//   - upcoming renginius
//   - latest naujienas
//
// Cache'inta agresyviai (s-maxage=300) — nav preview keičiasi retai.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()

  try {
    const [artistsLtRes, artistsWorldRes, albumsRes, tracksRes, eventsRes, newsRes] = await Promise.all([
      // 12 LT atlikėjų pagal score (su scroll'u juostoje)
      supabase
        .from('artists')
        .select('id, slug, name, country, cover_image_url')
        .eq('country', 'Lietuva')
        .not('score', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(12),

      // 12 užsienio atlikėjų pagal score
      supabase
        .from('artists')
        .select('id, slug, name, country, cover_image_url')
        .neq('country', 'Lietuva')
        .not('score', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(12),

      // 12 naujausių albumų
      supabase
        .from('albums')
        .select('id, slug, title, cover_image_url, year, artists!albums_artist_id_fkey(name, slug)')
        .not('cover_image_url', 'is', null)
        .order('year', { ascending: false, nullsFirst: false })
        .order('month', { ascending: false, nullsFirst: false })
        .limit(12),

      // 12 trending dainų
      supabase
        .from('tracks')
        .select('id, title, cover_url, release_year, artists!tracks_artist_id_fkey(id, name, slug, cover_image_url)')
        .not('cover_url', 'is', null)
        .order('id', { ascending: false })
        .limit(12),

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
        .select('id, slug, title, image_small_url, image_title_url, published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(4),
    ])

    const payload = {
      artistsLt: (artistsLtRes.data || []).map((a: any) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        image: a.cover_image_url,
      })),
      artistsWorld: (artistsWorldRes.data || []).map((a: any) => ({
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
        artistSlug: a.artists?.slug || '',
      })),
      tracks: (tracksRes.data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        image: t.cover_url || t.artists?.cover_image_url || null,
        year: t.release_year,
        artist: t.artists?.name || '',
        artistSlug: t.artists?.slug || '',
      })),
      events: (eventsRes.data || []).map((e: any) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        date: e.start_date,
        venue: e.venue_name,
        image: e.cover_image_url,
      })),
      news: (newsRes.data || []).map((n: any) => ({
        id: n.id,
        slug: n.slug,
        title: n.title,
        image: n.image_small_url || n.image_title_url || null,
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
