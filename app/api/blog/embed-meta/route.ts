// app/api/blog/embed-meta/route.ts
//
// Klijuojant URL į quick mode editor'ių, pašaukiam šį endpoint'ą — jis
// (a) nustato embed tipą iš URL pattern'o, (b) pabando paimti title/thumbnail
// per oEmbed (kur palaikoma) ar HTML <meta og:*> tag'us. Grąžinam viską,
// kas reikalinga preview kortelei. Klaidos atveju grąžinam tik tipą.
//
// Specialiai NEbent fallback'inam į scraping be timeout'o — 4s ribota,
// kad nepakimba editor'ius.

import { NextRequest, NextResponse } from 'next/server'
import { detectEmbed } from '@/lib/embed-detect'

const FETCH_TIMEOUT_MS = 4000

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url') || ''
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const detected = detectEmbed(url)

  // YouTube ir Spotify turi viešus oEmbed endpoint'us
  let title: string | null = detected?.title || null
  let thumbnail: string | null = detected?.thumbnailUrl || null
  let author: string | null = null

  try {
    const oembedUrl = oembedFor(url)
    if (oembedUrl) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      const res = await fetch(oembedUrl, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json() as any
        title = data?.title || title
        thumbnail = data?.thumbnail_url || thumbnail
        author = data?.author_name || null
      }
    }
  } catch {
    /* swallow — pre-detect data wins */
  }

  return NextResponse.json({
    type: detected?.type || 'other',
    embed_url: detected?.embedUrl || null,
    embed_html: detected?.html || null,
    thumbnail_url: thumbnail,
    title,
    author,
  })
}

function oembedFor(url: string): string | null {
  if (/youtube\.com|youtu\.be/.test(url)) {
    return `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  }
  if (/open\.spotify\.com/.test(url)) {
    return `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
  }
  if (/soundcloud\.com/.test(url)) {
    return `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
  }
  return null
}
