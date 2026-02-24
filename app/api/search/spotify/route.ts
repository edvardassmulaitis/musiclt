import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const token = searchParams.get('token') || ''

  if (!q.trim()) return NextResponse.json({ results: [] })
  if (!token) return NextResponse.json({ error: 'no_token', results: [] }, { status: 401 })

  try {
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
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
