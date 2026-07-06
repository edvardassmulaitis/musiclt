import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import { resizeForUpload } from '@/lib/image-resize'
import { assertPublicHttpUrlResolved } from '@/lib/net-guard'

// SVG atmetamas: gali turėti <script>/<foreignObject> (stored XSS viešame bucket).
function isBlockedImageType(t: string): boolean {
  const ct = t.toLowerCase()
  return ct.includes('svg')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'covers'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // Buvo `admin`-only — atveriam visiems prisijungusiems vartotojams, nes
  // blog editor'iui reikia inline image upload'o. Validuojam content type
  // ir size žemiau, tad anonim'ai negali piktnaudžiauti.
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Prisijunk' }, { status: 401 })
  }

  try {
    const contentType = req.headers.get('content-type') || ''

    // ── URL import ──────────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const { url } = await req.json()
      if (!url) return NextResponse.json({ error: 'URL nerastas' }, { status: 400 })

      // SSRF apsauga: tik viešas http(s), be vidinių taikinių (+ DNS resolve).
      try {
        await assertPublicHttpUrlResolved(url)
      } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Blokuotas URL' }, { status: 400 })
      }

      const response = await fetch(url, { redirect: 'follow' })
      if (!response.ok) throw new Error(`Nepavyko parsisiųsti: ${response.status}`)
      if (response.url) {
        try { await assertPublicHttpUrlResolved(response.url) }
        catch { return NextResponse.json({ error: 'Blokuotas redirect taikinys' }, { status: 400 }) }
      }

      const imgContentType = response.headers.get('content-type') || 'image/jpeg'
      if (!imgContentType.startsWith('image/') || isBlockedImageType(imgContentType)) {
        return NextResponse.json({ error: 'URL nėra tinkamas paveikslėlis' }, { status: 400 })
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > 25 * 1024 * 1024) {
        return NextResponse.json({ error: 'Failas per didelis (max 25MB prieš resize)' }, { status: 400 })
      }

      // Resize/compress: max 1920px webp q80 — sutaupo ~5-10x storage
      const resized = await resizeForUpload(buffer, imgContentType)
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${resized.ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filename, resized.buffer, { contentType: resized.contentType, upsert: false })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename)
      return NextResponse.json({ url: urlData.publicUrl, _bytes: { in: resized.inputBytes, out: resized.outputBytes } })
    }

    // ── File upload ─────────────────────────────────────────────────────────
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Failas nerastas' }, { status: 400 })

    if (!file.type.startsWith('image/') || isBlockedImageType(file.type)) {
      return NextResponse.json({ error: 'Leidžiami tik nuotraukų failai (ne SVG)' }, { status: 400 })
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Failas per didelis (max 25MB prieš resize)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // Resize/compress: max 1920px webp q80 — sutaupo ~5-10x storage
    const resized = await resizeForUpload(buffer, file.type)
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${resized.ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filename, resized.buffer, { contentType: resized.contentType, upsert: false })
    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename)
    return NextResponse.json({ url: urlData.publicUrl, _bytes: { in: resized.inputBytes, out: resized.outputBytes } })

  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e.message || 'Upload nepavyko' }, { status: 500 })
  }
}
