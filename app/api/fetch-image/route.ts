import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { url, returnDataUrl } = await req.json()
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

    // Fetch the image server-side (no CORS issues)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MusicLT/1.0)',
        'Referer': 'https://en.wikipedia.org/',
        'Accept': 'image/*,*/*',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      return NextResponse.json({ error: `HTTP ${response.status}` }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())
    const base64 = buffer.toString('base64')
    const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`

    // If caller just wants dataUrl for cropper preview — return immediately
    if (returnDataUrl) {
      return NextResponse.json({ url: dataUrl, dataUrl })
    }

    // Otherwise upload to Supabase storage
    const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg'
    const filename = `artists/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filename, buffer, { contentType: contentType.split(';')[0], upsert: false })

    if (uploadError) {
      // Fallback: return dataUrl if upload fails
      return NextResponse.json({ url: dataUrl, dataUrl })
    }

    const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filename)

    // Always return both url AND dataUrl so client can use whichever
    return NextResponse.json({ url: publicUrl, dataUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
