import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Fetch Instagram media for connected artists
export async function POST(req: NextRequest) {
  try {
    const { accessToken, limit = 12 } = await req.json()

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token provided' }, { status: 400 })
    }

    // Fetch media from Instagram Graph API
    const res = await fetch(
      `https://graph.instagram.com/me/media?fields=id,media_type,media_url,permalink,caption,timestamp,thumbnail_url&access_token=${accessToken}&limit=${limit}`
    )

    if (!res.ok) {
      const error = await res.text()
      return NextResponse.json({ error: 'Instagram API error', details: error }, { status: 500 })
    }

    const data = await res.json()
    return NextResponse.json({ media: data.data || [] })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
