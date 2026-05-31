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
import { getCurrentWeekMonday } from '@/lib/top-week'

export const dynamic = 'force-dynamic'

/** Mini chart eilutės topai dropdown'ui (LT TOP 30 + TOP 40 inline). */
async function getTopMini(sb: any, topType: string, limit: number) {
  const monday = getCurrentWeekMonday()
  const { data: week } = await sb
    .from('top_weeks')
    .select('id, is_finalized')
    .eq('top_type', topType).eq('week_start', monday).maybeSingle()
  if (!week) return []
  const { data: rows } = await sb
    .from('top_entries')
    .select('position, total_votes, tracks:track_id ( slug, title, cover_url, artists:artist_id ( slug, name ) )')
    .eq('week_id', week.id)
    .order(week.is_finalized ? 'position' : 'total_votes', { ascending: !!week.is_finalized })
    .limit(limit)
  return (rows || []).map((r: any, i: number) => {
    const tr = Array.isArray(r.tracks) ? r.tracks[0] : r.tracks
    const ar = tr ? (Array.isArray(tr.artists) ? tr.artists[0] : tr.artists) : null
    return {
      position: r.position ?? i + 1,
      title: tr?.title ?? '—', artist: ar?.name ?? '—',
      artistSlug: ar?.slug ?? '', trackSlug: tr?.slug ?? null,
      image: tr?.cover_url ?? null,
    }
  })
}

export async function GET() {
  const supabase = createAdminClient()

  try {
    const [artistsLtRes, artistsWorldRes, albumsRes, tracksRes, eventsRes, newsRes, genresRes, ltCountRes, worldCountRes] = await Promise.all([
      // (genres pridėtas paskutinis — žr. apačioje)
      // 12 LT atlikėjų pagal score (su scroll'u juostoje)
      supabase
        .from('artists')
        .select('id, slug, name, country, cover_image_url')
        .eq('country', 'Lietuva')
        .not('score', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(12),

      // 12 užsienio atlikėjų — country != Lietuva ARBA null. Reikalaujam
      // cover_image_url (kad nebūtų placeholder'iai), score nullable.
      supabase
        .from('artists')
        .select('id, slug, name, country, cover_image_url, score')
        .or('country.is.null,country.neq.Lietuva')
        .not('cover_image_url', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
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

      // 8 main žanrai su cover_image_url (admin'as nustato per /admin/genres)
      supabase
        .from('genres')
        .select('id, name, cover_image_url')
        .order('name'),

      // LT atlikėjų skaičius (DB total) — naudojamas Daugiau tile'ui
      supabase
        .from('artists')
        .select('id', { count: 'exact', head: true })
        .eq('country', 'Lietuva'),

      // Užsienio atlikėjų skaičius
      supabase
        .from('artists')
        .select('id', { count: 'exact', head: true })
        .or('country.is.null,country.neq.Lietuva'),
    ])

    // ── Topai dropdown'ui: LT TOP 30 + TOP 40 inline + featured išoriniai + votings ──
    const [top30Mini, top40Mini, featuredRes, votingsRes] = await Promise.all([
      getTopMini(supabase, 'lt_top30', 4),
      getTopMini(supabase, 'top40', 4),
      supabase
        .from('external_charts')
        .select('id, source, chart_key, title, subtitle, scope, accent, cover_image_url, period_label, size')
        .eq('is_current', true).eq('featured', true)
        .order('featured_order', { ascending: true })
        .limit(8),
      // Apdovanojimai / rinkimai — aktyvūs + artimiausi + neseni editions.
      supabase
        .from('voting_editions')
        .select('id, slug, name, year, status, vote_open, vote_close, cover_image_url, voting_channels:channel_id ( slug, name )')
        .order('vote_close', { ascending: false, nullsFirst: false })
        .limit(6),
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
      // Žanrų name → cover_image_url map (frontend lookup'ina pagal name iš GENRE_COLORS)
      genres: (genresRes.data || []).reduce((acc: Record<string, string | null>, g: any) => {
        acc[g.name] = g.cover_image_url || null
        return acc
      }, {} as Record<string, string | null>),
      // Total atlikėjų DB skaičiai — Daugiau tile'ui (atsinaujinia su SWR cache)
      counts: {
        artistsLt:    ltCountRes.count || 0,
        artistsWorld: worldCountRes.count || 0,
      },
      // Topai dropdown'ui: pagrindiniai voting topai + featured išoriniai + votings
      topChart: { top30: top30Mini, top40: top40Mini },
      featuredCharts: (featuredRes.data || []).map((c: any) => ({
        id: c.id, source: c.source, chartKey: c.chart_key, title: c.title,
        subtitle: c.subtitle, scope: c.scope, accent: c.accent || '#6366f1',
        image: c.cover_image_url || null, period: c.period_label, size: c.size,
      })),
      votings: (votingsRes.data || []).map((v: any) => {
        const ch = Array.isArray(v.voting_channels) ? v.voting_channels[0] : v.voting_channels
        return {
          id: v.id, slug: v.slug, name: v.name, year: v.year, status: v.status,
          voteOpen: v.vote_open, voteClose: v.vote_close, image: v.cover_image_url || null,
          channelSlug: ch?.slug ?? null, channelName: ch?.name ?? null,
        }
      }),
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
