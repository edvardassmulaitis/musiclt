/**
 * GET /api/admin/artists/[id]/track-suggestions?q=optional&embed_url=u1&embed_url=u2
 *
 * Smart track resolution endpoint'as wizard'ui inbox'e — kai AI paminėjo
 * dainą, kurios nėra DB, šis endpoint'as grąžina ranked'tas alternatyvas
 * keturių sluoksnių:
 *
 *   1. db_matches   — fuzzy ILIKE'as ant `q` per esamus artist'o track'us
 *   2. db_recent    — naujausi 5 track'ai su video_url (release_date desc)
 *   3. db_top       — 5 didžiausi score'ai (score desc, NULL filter'inta)
 *   4. yt_embeds    — embed_urls'ams iškvietam YouTube metadata
 *   5. wiki_singles — fetch'inam artist'o Wikipedia page + parse'inam recent
 *                     singles iš infobox'o (best-effort, gali nepavykti)
 *
 * Visi grąžinami su pakankama info'ja UI'ui (title, video_url, label).
 * Modal'as `<TrackSuggestPicker>` sklandžiai render'ina.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { extractVideoIdFromUrl, getVideoDetails } from '@/lib/yt-innertube'
import { parseSinglesFromInfobox, initializeConstants } from '@/lib/wiki-parser'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'

export const runtime = 'nodejs'
export const maxDuration = 30

// Wiki-parser constants vienkartinė init (modul-level)
let _wikiInit = false
function ensureWikiInit() {
  if (_wikiInit) return
  initializeConstants(COUNTRIES as readonly string[] as string[], SUBSTYLES)
  _wikiInit = true
}

type DbTrack = {
  track_id: number
  title: string
  video_url: string | null
  score: number | null
  release_year: number | null
}

type YtEmbedTrack = {
  video_id: string
  title: string
  views: number | null
  uploaded_at: string | null
  thumb: string
  url: string
}

type WikiSingle = {
  title: string
  year: number | null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const artistId = parseInt(id, 10)
  if (Number.isNaN(artistId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  const embedUrls = url.searchParams.getAll('embed_url').slice(0, 5)

  const supabase = createAdminClient()

  // ── 1) Artist'as ─────────────────────────────────────────────────
  const { data: artist, error: aErr } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('id', artistId)
    .maybeSingle()
  if (aErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }

  // ── 2) DB matches (jei q duotas — ILIKE'as) ──────────────────────
  let dbMatches: DbTrack[] = []
  if (q.length >= 2) {
    const { data } = await supabase
      .from('tracks')
      .select('id, title, video_url, score, release_year')
      .eq('artist_id', artistId)
      .ilike('title', `%${q}%`)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(8)
    dbMatches = (data || []).map(t => ({
      track_id: t.id, title: t.title, video_url: t.video_url,
      score: t.score, release_year: t.release_year,
    }))
  }

  // ── 3) DB recent (newest with video) ─────────────────────────────
  const { data: recentData } = await supabase
    .from('tracks')
    .select('id, title, video_url, score, release_year, release_date')
    .eq('artist_id', artistId)
    .not('video_url', 'is', null)
    .order('release_date', { ascending: false, nullsFirst: false })
    .limit(5)
  const dbRecent: DbTrack[] = (recentData || []).map(t => ({
    track_id: t.id, title: t.title, video_url: t.video_url,
    score: t.score, release_year: t.release_year,
  }))

  // ── 4) DB top (score desc with video) ────────────────────────────
  const { data: topData } = await supabase
    .from('tracks')
    .select('id, title, video_url, score, release_year')
    .eq('artist_id', artistId)
    .not('video_url', 'is', null)
    .not('score', 'is', null)
    .order('score', { ascending: false })
    .limit(5)
  const dbTop: DbTrack[] = (topData || []).map(t => ({
    track_id: t.id, title: t.title, video_url: t.video_url,
    score: t.score, release_year: t.release_year,
  }))

  // ── 5) YouTube embed metadata (parallel) ─────────────────────────
  const ytEmbeds: YtEmbedTrack[] = []
  if (embedUrls.length > 0) {
    const lookups = embedUrls.map(async (eurl) => {
      const vid = extractVideoIdFromUrl(eurl)
      if (!vid) return null
      try {
        const d = await getVideoDetails(vid)
        if (!d) return null
        return {
          video_id: vid,
          title: d.title || `YouTube video ${vid}`,
          views: typeof d.viewCount === 'number' ? d.viewCount : null,
          uploaded_at: d.uploadedAt || null,
          thumb: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${vid}`,
        } as YtEmbedTrack
      } catch {
        return null
      }
    })
    const results = await Promise.all(lookups)
    for (const r of results) if (r) ytEmbeds.push(r)
  }

  // ── 6) Wiki recent singles (best-effort, timeout-protected) ──────
  let wikiSingles: WikiSingle[] = []
  let wikiError: string | undefined
  try {
    ensureWikiInit()
    const wikiTitle = artist.name // naive — daugumoje atvejų artist name = wiki title
    const wikiUrl =
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}` +
      `&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&redirects=1`
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 8000)
    const res = await fetch(wikiUrl, { signal: ac.signal })
    clearTimeout(t)
    if (res.ok) {
      const data = await res.json()
      const pages: any = data?.query?.pages || {}
      const firstKey = Object.keys(pages)[0]
      const wikitext: string = pages[firstKey]?.revisions?.[0]?.slots?.main?.['*'] || ''
      if (wikitext) {
        const { names, dates } = parseSinglesFromInfobox(wikitext)
        // Sort'inam pagal naujausią datą (jei žinoma). dates Map'as turi
        // SingleInfoboxData su year/month/day, bet album'o pavadinimo —
        // ne. Galima pridėt ateity per parseDiscographyPage().
        const items: WikiSingle[] = Array.from(names).map(n => {
          const meta = dates.get(n)
          return { title: n, year: meta?.year || null }
        })
        items.sort((a, b) => (b.year || 0) - (a.year || 0))
        wikiSingles = items.slice(0, 10)
      }
    }
  } catch (e: any) {
    wikiError = e?.message || 'wiki fetch failed'
  }

  return NextResponse.json({
    artist: { id: artist.id, name: artist.name, slug: artist.slug },
    q,
    db_matches: dbMatches,
    db_recent: dbRecent,
    db_top: dbTop,
    yt_embeds: ytEmbeds,
    wiki_singles: wikiSingles,
    errors: wikiError ? { wiki: wikiError } : undefined,
  })
}
