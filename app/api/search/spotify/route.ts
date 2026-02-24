import { NextRequest, NextResponse } from 'next/server'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAnonymousToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  // Method: fetch Spotify's anonymous client token endpoint
  // This is what the web player uses before user logs in
  const res = await fetch('https://clienttoken.spotify.com/v1/clienttoken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_data: {
        client_version: '1.2.31.588.g1d08c15e',
        client_id: 'd8a5ed958d274c2e8ee717e6a4b0971d', // Spotify web player client ID (public)
        js_sdk_data: {
          device_brand: 'unknown',
          device_model: 'unknown',
          os: 'windows',
          os_version: 'NT 10.0',
          device_id: Math.random().toString(36).slice(2),
          device_type: 'computer',
        },
      },
    }),
  })

  const data = await res.json()
  const token = data?.granted_token?.token
  const expiresAfterSeconds = data?.granted_token?.expires_after_seconds || 3600

  if (!token) throw new Error(`No token in response: ${JSON.stringify(data).slice(0, 200)}`)

  cachedToken = { token, expiresAt: Date.now() + expiresAfterSeconds * 1000 }
  return token
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  try {
    const token = await getAnonymousToken()

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=LT`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const data = await res.json()
    if (data.error) throw new Error(`Spotify: ${data.error.status} ${data.error.message}`)

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
