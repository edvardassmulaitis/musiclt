import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url?.startsWith('http')) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; musiclt/1.0)' }
    })
    if (!res.ok) return NextResponse.json({ error: `HTTP ${res.status}` }, { status: 400 })

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return NextResponse.json({ error: 'Not an image' }, { status: 400 })

    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return NextResponse.json({ dataUrl: `data:${contentType};base64,${base64}` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
