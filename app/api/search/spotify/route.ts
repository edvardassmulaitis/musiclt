import { NextRequest, NextResponse } from 'next/server'

// Anonymous token cache (Spotify web player trick)
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAnonymousToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  // Fetch Spotify web player page - it returns an anonymous accessToken
  const res = await fetch('https://open.spotify.com/search', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })

  const html = await res.text()

  // Extract token from Spotify's server-rendered page data
  const tokenMatch = html.match(/"accessToken":"([^"]+)"/)
  const expiresMatch = html.match(/"accessTokenExpirationTimestampMs":(\d+)/)

  if (!tokenMatch) throw new Error('Could not extract Spotify token')

  const token = tokenMatch[1]
  const expiresAt = expiresMatch ? parseInt(expiresMatch[1]) : Date.now() + 3600_000

  cachedToken = { token, expiresAt }
  return token
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  try {
    const token = await getAnonymousToken()

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=LT`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0',
        },
      }
    )

    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    const results = (data.tracks?.items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      artists: item.artists.map((a: any) => a.name).join(', '),
      album: item.album.name,
      album_image: item.album.images?.[2]?.url || item.album.images?.[0]?.url || '',
      duration_ms: item.duration_ms,
      preview_url: item.preview_url,
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    console.error('Spotify search error:', e.message)
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
