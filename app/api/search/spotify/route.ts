import { NextRequest, NextResponse } from 'next/server'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getTokenFromSpDc(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token
  }

  const spDc = process.env.SPOTIFY_SP_DC
  if (!spDc) throw new Error('SPOTIFY_SP_DC env variable nėra nustatytas')

  const res = await fetch(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    {
      headers: {
        'Cookie': `sp_dc=${spDc}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }
  )

  const data = await res.json()
  if (!data.accessToken) throw new Error('Nepavyko gauti token: ' + JSON.stringify(data).slice(0, 100))

  cachedToken = { token: data.accessToken, expiresAt: data.accessTokenExpirationTimestampMs }
  return data.accessToken
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  try {
    const token = await getTokenFromSpDc()

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8&market=LT`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.error) throw new Error(`${data.error.status}: ${data.error.message}`)

    const results = (data.tracks?.items || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      artists: item.artists.map((a: any) => a.name).join(', '),
      album: item.album.name,
      album_image: item.album.images?.[2]?.url || item.album.images?.[0]?.url || '',
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    console.error('Spotify error:', e.message)
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
