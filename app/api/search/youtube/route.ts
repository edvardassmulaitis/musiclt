import { NextRequest, NextResponse } from 'next/server'

// YouTube Data API v3 search
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    // Fallback: return search URL for manual use
    return NextResponse.json({
      results: [],
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      error: 'YOUTUBE_API_KEY not configured'
    })
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=8` +
      `&videoCategoryId=10&key=${apiKey}` // category 10 = Music
    )
    const data = await res.json()

    if (data.error) throw new Error(data.error.message)

    const results = (data.items || []).map((item: any) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
