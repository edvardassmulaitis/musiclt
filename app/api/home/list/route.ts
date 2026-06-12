/**
 * GET /api/home/list
 *
 * Pilnas (paginuotas) sąrašas homepage'o „Naujos dainos" / „Nauji albumai" /
 * „Greitai pasirodys" modalams. Praplečia /api/home/latest (kuris grąžina tik
 * ~10 įrašų per lane) — čia grąžinam VISĄ filtruotą rinkinį su žanro facet'ais,
 * like_count'ais ir rūšiavimu, + offset/limit pagination ("Rodyti daugiau").
 *
 * Query params:
 *   type   = tracks | albums | upcoming   (default tracks)
 *   lane   = lt | world                   (upcoming nepaiso lane)
 *   genre  = žanro pavadinimas (filtras)  (tuščias = visi)
 *   sort   = new | liked | az             (default new)
 *   offset = 0                            (pagination)
 *   limit  = 100                          (max 200)
 *
 * Atsakas: { items: [...], total, genres: [{ name, count }] }
 *   - genres facet'ai skaičiuojami per VISĄ rinkinį (prieš filtrą), kad chip'ai
 *     būtų stabilūs nepriklausomai nuo pasirinkto žanro.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import {
  getLatestTracksForHome,
  getLatestAlbumsForHome,
  getUpcomingAlbumsForHome,
  mapTrackForHome,
  mapAlbumForHome,
} from '@/lib/home-latest'

type Sort = 'new' | 'liked' | 'az'

export async function GET(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams
    const type = (sp.get('type') || 'tracks') as 'tracks' | 'albums' | 'upcoming'
    const lane = (sp.get('lane') || 'lt') as 'lt' | 'world'
    const genre = (sp.get('genre') || '').trim()
    const sort = (sp.get('sort') || 'new') as Sort
    const offset = Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0)
    const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '100', 10) || 100))

    const sb = createAdminClient()

    // 1) Pilnas rinkinys pagal type + lane (jau surūšiuotas „new" tvarka libe).
    let rows: any[] = []
    let entityType: 'track' | 'album' = 'track'
    if (type === 'albums') {
      const a = await getLatestAlbumsForHome()
      rows = (lane === 'world' ? a.worldFull : a.ltFull).map(mapAlbumForHome)
      entityType = 'album'
    } else if (type === 'upcoming') {
      const u = await getUpcomingAlbumsForHome()
      rows = u.full.map(mapAlbumForHome)
      entityType = 'album'
    } else {
      const t = await getLatestTracksForHome()
      // Modal'e rodom VIENĄ dainą per atlikėją (Full = per-artist dedup), kaip ir
      // homepage juostoje, tik be 10 įrašų limito. Anksčiau buvo Raw (per-daina),
      // tad atlikėjui išleidus albumą modalą užtvindydavo visi to atlikėjo takeliai
      // (pvz. Latto 9 dainos). Edvardo prašymu 2026-06-09.
      rows = (lane === 'world' ? t.worldFull : t.ltFull).map(mapTrackForHome)
      entityType = 'track'
    }

    // 2) Žanrai per atlikėją (artist_genres → genres). Žanro raktas = pavadinimas
    //    (genres lentelė neturi slug stulpelio).
    const artistIds = Array.from(new Set(rows.map(r => r.artist_id).filter(Boolean)))
    const genreByArtist = new Map<number, string[]>()
    if (artistIds.length) {
      const { data: agRows } = await sb
        .from('artist_genres')
        .select('artist_id, genres(name)')
        .in('artist_id', artistIds)
      for (const r of (agRows || []) as any[]) {
        const name = r.genres?.name
        if (!name) continue
        const list = genreByArtist.get(r.artist_id) || []
        if (!list.includes(name)) list.push(name)
        genreByArtist.set(r.artist_id, list)
      }
    }
    for (const r of rows) r.genres = genreByArtist.get(r.artist_id) || []

    // 3) like_count batch per RPC like_counts_by_entity.
    const ids = rows.map(r => r.id)
    const likeMap = new Map<number, number>()
    if (ids.length) {
      try {
        const { data: lc } = await sb.rpc('like_counts_by_entity', {
          p_entity_type: entityType,
          p_entity_ids: ids,
        })
        for (const r of (lc || []) as any[]) likeMap.set(Number(r.entity_id), Number(r.like_count))
      } catch {
        /* RPC nesukurta — like_count lieka 0, nelaužiam sąrašo */
      }
    }
    for (const r of rows) r.like_count = likeMap.get(r.id) || 0

    // 3b) „Hot" popularumas pagal YouTube peržiūras → pop lygis 1-5.
    //     Tracks: track.video_views. Albums: didžiausios albumo dainos peržiūros
    //     (album_tracks → tracks.video_views, max per album).
    if (entityType === 'album') {
      const albIds = rows.map(r => r.id)
      const viewByAlbum = new Map<number, number>()
      if (albIds.length) {
        const { data: atRows } = await sb
          .from('album_tracks')
          .select('album_id, tracks(video_views)')
          .in('album_id', albIds)
        for (const r of (atRows || []) as any[]) {
          const v = Number(r.tracks?.video_views || 0)
          if (v > (viewByAlbum.get(r.album_id) || 0)) viewByAlbum.set(r.album_id, v)
        }
      }
      for (const r of rows) r.views = viewByAlbum.get(r.id) || 0
    } else {
      for (const r of rows) r.views = Number(r.video_views || 0)
    }
    const popTier = (v: number) => (v >= 5e6 ? 5 : v >= 1e6 ? 4 : v >= 2e5 ? 3 : v >= 3e4 ? 2 : v > 0 ? 1 : 0)
    for (const r of rows) r.pop = popTier(r.views)

    // 4) Žanro facet'ai (per visą rinkinį, prieš filtrą).
    const facet = new Map<string, number>()
    for (const r of rows) {
      for (const name of r.genres as string[]) facet.set(name, (facet.get(name) || 0) + 1)
    }
    const genres = Array.from(facet.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'lt'))

    // 5) Filtras pagal žanrą.
    let filtered = genre
      ? rows.filter(r => (r.genres as string[]).includes(genre))
      : rows

    // 6) Rūšiavimas.
    //   „new"   = pagal realią datą (naujausi viršuje) — VISAS rinkinys
    //   „liked" = hibridinis balas (70% šviežumas + 30% populiarumas)
    //   „az"    = abėcėlė
    if (sort === 'new') {
      // Tracks: video_uploaded_at > release_date. Albums: release_date > year.
      filtered = [...filtered].sort((a, b) => {
        const da = new Date(a.video_uploaded_at || a.release_date || (a.year ? `${a.year}-01-01` : '1970-01-01')).getTime()
        const db = new Date(b.video_uploaded_at || b.release_date || (b.year ? `${b.year}-01-01` : '1970-01-01')).getTime()
        return db - da
      })
    } else if (sort === 'liked') {
      // Hibridinis: freshness * 0.7 + popularity * 0.3
      const nowMs = Date.now()
      const windowMs = 90 * 86_400_000
      filtered = [...filtered].sort((a, b) => {
        const scoreOf = (r: any) => {
          const dateMs = new Date(r.video_uploaded_at || r.release_date || (r.year ? `${r.year}-01-01` : '1970-01-01')).getTime()
          const freshness = Math.max(0, Math.min(1, (dateMs - (nowMs - windowMs)) / windowMs))
          const popArtist = Math.min(1, (r.artists?.score || 0) / 80)
          const popViews = (r.views || 0) > 0 ? Math.min(1, Math.log10(r.views) / 8) : 0
          const popularity = popArtist * 0.7 + popViews * 0.3
          return freshness * 0.7 + popularity * 0.3
        }
        return scoreOf(b) - scoreOf(a)
      })
    } else if (sort === 'az') {
      filtered = [...filtered].sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'lt'),
      )
    }

    const total = filtered.length
    const items = filtered.slice(offset, offset + limit)

    return NextResponse.json(
      { items, total, genres },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          'CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        },
      },
    )
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
