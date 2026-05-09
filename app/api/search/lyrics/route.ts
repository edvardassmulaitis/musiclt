import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artist = searchParams.get('artist') || ''
  const title = searchParams.get('title') || ''
  if (!artist || !title) return NextResponse.json({ lyrics: null })

  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    )
    const data = await res.json()
    if (data.lyrics) return NextResponse.json({ lyrics: data.lyrics.trim() })
    return NextResponse.json({ lyrics: null })
  } catch {
    return NextResponse.json({ lyrics: null })
  }
}
