import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resizeForUpload } from '@/lib/image-resize'
import { assertPublicHttpUrlResolved, isPublicHttpUrl } from '@/lib/net-guard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_FETCH_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    // Auth: tik prisijungę vartotojai (visi šio endpoint'o klientai yra
    // admin/editorial/studija UI). Sustabdo anoniminį SSRF.
    const session = await getServerSession(authOptions)
    if (!(session?.user as any)?.id) {
      return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
    }

    const { url, returnDataUrl } = await req.json()
    if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

    // SSRF apsauga: tik viešas http(s), be vidinių/private taikinių (+ DNS resolve).
    try {
      await assertPublicHttpUrlResolved(url)
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Blokuotas URL' }, { status: 400 })
    }

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

    // Redirect-SSRF apsauga: galutinis URL (po redirect'ų) taip pat turi būti viešas.
    if (response.url && !isPublicHttpUrl(response.url)) {
      return NextResponse.json({ error: 'Blokuotas redirect taikinys' }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    // returnDataUrl grąžina neapdorotą turinį — leidžiam tik tikrus paveikslėlius,
    // kad tai netaptų bendru read-primitive.
    if (returnDataUrl && !contentType.toLowerCase().startsWith('image/')) {
      return NextResponse.json({ error: 'Ne paveikslėlis' }, { status: 400 })
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_FETCH_BYTES) {
      return NextResponse.json({ error: `Failas per didelis (${(buffer.length/1024/1024).toFixed(1)}MB > 25MB)` }, { status: 400 })
    }

    // Grąžinti dataUrl jei prašoma (pvz. cropper preview) — be resize, kad cropper'iui būtų original
    if (returnDataUrl) {
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`
      return NextResponse.json({ url: dataUrl, dataUrl })
    }

    // Resize/compress prieš upload — max 1920px webp q80, sutaupo ~5-10x storage
    const resized = await resizeForUpload(buffer, contentType)
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${resized.ext}`

    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(filename, resized.buffer, { contentType: resized.contentType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: `Upload nepavyko: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from('covers').getPublicUrl(filename)
    return NextResponse.json({ url: publicUrl, _bytes: { in: resized.inputBytes, out: resized.outputBytes } })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
