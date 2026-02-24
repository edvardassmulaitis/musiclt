import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      results: [],
      searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
      error: 'YOUTUBE_API_KEY not configured'
    })
  }

  try {
    // Step 1: Search
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=10` +
      `&videoCategoryId=10&key=${apiKey}`
    )
    const searchData = await searchRes.json()
    if (searchData.error) throw new Error(searchData.error.message)

    const videoIds = (searchData.items || []).map((i: any) => i.id.videoId).join(',')
    if (!videoIds) return NextResponse.json({ results: [] })

    // Step 2: Check embeddable + status for each video
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?` +
      `part=status,snippet&id=${videoIds}&key=${apiKey}`
    )
    const detailData = await detailRes.json()

    const availableIds = new Set(
      (detailData.items || [])
        .filter((v: any) =>
          v.status?.embeddable === true &&
          v.status?.uploadStatus === 'processed' &&
          v.status?.privacyStatus === 'public'
        )
        .map((v: any) => v.id)
    )

    const results = (searchData.items || [])
      .filter((item: any) => availableIds.has(item.id.videoId))
      .slice(0, 8)
      .map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
      }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
