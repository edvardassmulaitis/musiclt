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

    // Nustatyti tinkamus header'us pagal šaltinį
    const isWikimedia = url.includes('wikimedia.org') || url.includes('wikipedia.org')
    const headers: Record<string, string> = {
      'User-Agent': 'MusicLT/1.0 (https://musiclt.vercel.app; music database) Mozilla/5.0',
      'Accept': 'image/*,*/*;q=0.8',
    }
    if (isWikimedia) {
      headers['Referer'] = 'https://en.wikipedia.org/'
      headers['Accept-Language'] = 'en-US,en;q=0.9'
    }

    // Fetch su retry dėl Wikimedia rate limiting
    let response: Response | null = null
    let lastError = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt))
      try {
        response = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(20000),
        })
        if (response.ok) break
        lastError = `HTTP ${response.status}`
        if (response.status === 404 || response.status === 403) break // nebandyti iš naujo
      } catch (e: any) {
        lastError = e.message
      }
    }

    if (!response?.ok) {
      return NextResponse.json({ error: lastError || 'Fetch nepavyko' }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())

    // Grąžinti dataUrl jei prašoma (pvz. cropper preview)
    if (returnDataUrl) {
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`
      return NextResponse.json({ url: dataUrl, dataUrl })
    }

    // Įkelti į Supabase storage — 'covers' bucket
    const ext = contentType.includes('png') ? 'png'
      : contentType.includes('gif') ? 'gif'
      : contentType.includes('webp') ? 'webp'
      : 'jpg'
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(filename, buffer, { contentType: contentType.split(';')[0], upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Upload nepavyko: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(filename)
    return NextResponse.json({ url: publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
