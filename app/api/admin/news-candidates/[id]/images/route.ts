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
import { extractVideoIdFromUrl } from '@/lib/yt-innertube'

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
    .select('id, primary_artist_id, suggested_artist_ids, suggested_track_ids, suggested_image_url, embed_urls')
    .eq('id', candidateId)
    .single()
  if (error || !cand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const options: Array<{ url: string; label: string; source: string }> = []
  const seenYouTubeIds = new Set<string>()

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

  // ─── YouTube thumbnails — fallback'as kai artist neturi official photos ───
  // Šaltiniai (du):
  //   1) candidate.embed_urls — scout'as randa straipsnyje (YT/Spotify/etc)
  //   2) suggested_track_ids' tracks.video_url — DB matched track'ai
  //
  // YT thumbnail pattern: https://img.youtube.com/vi/{ID}/hqdefault.jpg
  // (hqdefault visada yra; maxresdefault gali 404'inti seniems video'ams)

  const ytUrlCandidates: Array<{ url: string; label: string }> = []

  // 1) Embed URLs iš source'o
  for (const embed of (cand.embed_urls || []) as string[]) {
    const vid = extractVideoIdFromUrl(embed)
    if (vid && !seenYouTubeIds.has(vid)) {
      seenYouTubeIds.add(vid)
      ytUrlCandidates.push({ url: embed, label: 'iš straipsnio' })
    }
  }

  // 2) Matched tracks su video_url
  const trackIds = (cand.suggested_track_ids || []) as number[]
  if (trackIds.length > 0) {
    const { data: tracks } = await supabase
      .from('tracks')
      .select('id, title, video_url, artists!tracks_artist_id_fkey(name)')
      .in('id', trackIds)
    for (const t of (tracks || []) as any[]) {
      if (!t.video_url) continue
      const vid = extractVideoIdFromUrl(t.video_url)
      if (vid && !seenYouTubeIds.has(vid)) {
        seenYouTubeIds.add(vid)
        const artistName = t.artists?.name || ''
        ytUrlCandidates.push({
          url: t.video_url,
          label: `${artistName} — ${t.title}`.slice(0, 60),
        })
      }
    }
  }

  // Sukuriame thumb options'us
  for (const yt of ytUrlCandidates) {
    const vid = extractVideoIdFromUrl(yt.url)
    if (!vid) continue
    options.push({
      url: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
      label: yt.label,
      source: 'youtube_thumb',
    })
  }

  // Source straipsnio nuotrauka NĖRA siūloma — copyright apsauga.

  return NextResponse.json({
    options,
    artist_id: primaryArtistId || null,
  })
}
