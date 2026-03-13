import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ results: [], error: 'YOUTUBE_API_KEY not configured' })

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=5&key=${apiKey}`
    )
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)

    const results = (data.items || []).map((item: any) => ({
      channelId: item.id.channelId,
      name: item.snippet.title,
      description: item.snippet.description?.slice(0, 80) || '',
      thumbnail: item.snippet.thumbnails?.default?.url || '',
      url: `https://www.youtube.com/channel/${item.id.channelId}`,
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
