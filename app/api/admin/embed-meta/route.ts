/**
 * GET /api/admin/embed-meta?url=<embed url>
 *
 * Grąžina embed'o metaduomenis admin peržiūrai (Video žingsnis inbox'e):
 *   { url, platform, label, title, thumbnail, embedSrc, playable }
 *
 * Title/thumbnail — best-effort per oEmbed (server-side, be CORS problemų;
 * su timeout'u, klaida NIEKAD nelaužo — grąžinam bent platformą + embedSrc).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { detectPlatform, PLATFORM_LABEL, buildEmbedSrc } from '@/lib/social-embed'

export const runtime = 'nodejs'

type Meta = {
  url: string
  platform: string
  label: string
  title: string | null
  thumbnail: string | null
  embedSrc: string | null
  playable: boolean
}

// Platforma + label, apimant ir tas, kurių detectPlatform nežino (spotify ir kt.)
function resolvePlatform(url: string): { platform: string; label: string } {
  const u = url.toLowerCase()
  if (/spotify\.com/.test(u)) return { platform: 'spotify', label: 'Spotify' }
  if (/soundcloud\.com/.test(u)) return { platform: 'soundcloud', label: 'SoundCloud' }
  if (/bandcamp\.com/.test(u)) return { platform: 'bandcamp', label: 'Bandcamp' }
  const p = detectPlatform(url)
  return { platform: p, label: PLATFORM_LABEL[p] || 'Nuoroda' }
}

function oembedEndpoint(platform: string, url: string): string | null {
  const enc = encodeURIComponent(url)
  switch (platform) {
    case 'youtube': return `https://www.youtube.com/oembed?url=${enc}&format=json`
    case 'spotify': return `https://open.spotify.com/oembed?url=${enc}`
    case 'soundcloud': return `https://soundcloud.com/oembed?url=${enc}&format=json`
    case 'tiktok': return `https://www.tiktok.com/oembed?url=${enc}`
    default: return null // instagram (reikia FB token'o), facebook, x, bandcamp
  }
}

async function fetchOembed(endpoint: string): Promise<{ title: string | null; thumbnail: string | null }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch(endpoint, { signal: ctrl.signal, headers: { 'User-Agent': 'musiclt/1.0' } })
    if (!res.ok) return { title: null, thumbnail: null }
    const j = await res.json()
    return {
      title: typeof j.title === 'string' ? j.title : null,
      thumbnail: typeof j.thumbnail_url === 'string' ? j.thumbnail_url : null,
    }
  } catch {
    return { title: null, thumbnail: null }
  } finally {
    clearTimeout(t)
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = (req.nextUrl.searchParams.get('url') || '').trim()
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 })

  const { platform, label } = resolvePlatform(url)
  const embedSrc = buildEmbedSrc(url)

  let title: string | null = null
  let thumbnail: string | null = null
  const endpoint = oembedEndpoint(platform, url)
  if (endpoint) {
    const meta = await fetchOembed(endpoint)
    title = meta.title
    thumbnail = meta.thumbnail
  }
  // Instagram/kiti be oEmbed — bent žmoniškas fallback title
  if (!title) {
    title = platform === 'instagram' ? 'Instagram įrašas'
      : platform === 'facebook' ? 'Facebook įrašas'
      : platform === 'x' ? 'X (Twitter) įrašas'
      : null
  }

  const out: Meta = {
    url,
    platform,
    label,
    title,
    thumbnail,
    embedSrc,
    playable: !!embedSrc,
  }
  return NextResponse.json(out)
}
