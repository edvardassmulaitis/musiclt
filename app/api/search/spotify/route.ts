import { NextRequest, NextResponse } from 'next/server'

// Cache Spotify access token in memory
let cachedToken: { token: string; expiresAt: number } | null = null

async function getSpotifyToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) throw new Error('Spotify credentials not configured')

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Spotify token')

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return cachedToken.token
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  try {
    const token = await getSpotifyToken()

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=LT`,
      { headers: { Authorization: `Bearer ${token}` } }
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
    return NextResponse.json({
      error: e.message,
      results: [],
      configured: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
    }, { status: 500 })
  }
}
