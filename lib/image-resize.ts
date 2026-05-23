/**
 * lib/image-resize.ts
 *
 * Bendras image resize/compression helper'is — naudojamas visose upload route'ėse
 * (/api/upload, /api/fetch-image, /api/admin/artists/[id]/rehost-images,
 * lib/gmail-attachments.ts).
 *
 * Strategija:
 *   - Max 1920px ilgosios pusės (fit: inside, be enlargement) — pakanka full-bleed
 *     hero hipot'aiteziniu Retina ekranu; thumb'ai (300px) tiek pat gražiai degraduoja
 *     per browser/CDN.
 *   - WebP quality 80 — tipiškai ~5-10x mažesni nei JPG/PNG be regimo kokybės skirtumo
 *   - SVG → palieka kaip yra (vektoras)
 *   - GIF animuotas → palieka kaip yra (sharp prarastų frame'us be papildomo darbo)
 *   - GIF statinis → konvertuoja į webp (mažesnis)
 *
 * Storage cleanup 2026-05-23: prieš šitą fix'ą covers bucket'as buvo 1000.8 MB,
 * iš jų top failai 20 MB JPG'ai (Wikipedia originalai per rehost-images).
 *
 * Po fix'o tipiškas 5 MB JPG → ~150-300 KB webp.
 */

import sharp from 'sharp'

const MAX_DIM = 1920
const WEBP_QUALITY = 80

export interface ResizedImage {
  /** Buffer'is ką siūsti į Storage. Jei skip'inta (SVG/animated GIF) — original buffer'is. */
  buffer: Buffer
  /** MIME type'as ką pasakyti Storage'ui. */
  contentType: string
  /** Failo extension'as be taško. */
  ext: string
  /** Ar buvo daryta konversija (debug/log'inimui). */
  converted: boolean
  /** Diagnostika — bytes prieš ir po. */
  inputBytes: number
  outputBytes: number
}

/**
 * Resize buffer'į iki <=1920px webp. Skip SVG ir animated GIF.
 * Niekada nemeta — jeigu sharp sufail'ina, grąžina original buffer.
 */
export async function resizeForUpload(
  input: Buffer,
  inputMime: string,
): Promise<ResizedImage> {
  const mime = inputMime.toLowerCase().split(';')[0].trim()
  const inputBytes = input.length

  // SVG → nieko nedaryti (vektoras)
  if (mime === 'image/svg+xml' || mime === 'image/svg') {
    return { buffer: input, contentType: mime, ext: 'svg', converted: false, inputBytes, outputBytes: inputBytes }
  }

  try {
    const image = sharp(input, { animated: false })
    const meta = await image.metadata()

    // Animated GIF/WebP — palieka kaip yra (be animated:true būtų prarastas frame count)
    if (meta.pages && meta.pages > 1) {
      const ext = mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp' : 'png'
      return { buffer: input, contentType: mime, ext, converted: false, inputBytes, outputBytes: inputBytes }
    }

    // Resize tik jei viršija MAX_DIM (be enlargement)
    let pipeline = image.rotate() // EXIF rotation — taikant prieš resize
    if ((meta.width || 0) > MAX_DIM || (meta.height || 0) > MAX_DIM) {
      pipeline = pipeline.resize({
        width: MAX_DIM,
        height: MAX_DIM,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }

    // Konvertuojam į webp visada — net ir nedidukus PNG'us (didelis tap'as)
    const output = await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer()

    // Jei kažkaip webp PADIDĖJO (būna su mažais PNG ikon'ais) — naudok original'ą
    if (output.length >= inputBytes && !((meta.width || 0) > MAX_DIM)) {
      return { buffer: input, contentType: mime, ext: extFromMime(mime), converted: false, inputBytes, outputBytes: inputBytes }
    }

    return {
      buffer: output,
      contentType: 'image/webp',
      ext: 'webp',
      converted: true,
      inputBytes,
      outputBytes: output.length,
    }
  } catch (e) {
    // Sharp gali sufail'inti su pažeistais failais — grąžinam original'ą, kad
    // upload'as neužstrigtų. Tik logge mes tai gausim.
    console.warn('[resizeForUpload] sharp failed, using original:', (e as Error).message)
    return { buffer: input, contentType: mime, ext: extFromMime(mime), converted: false, inputBytes, outputBytes: inputBytes }
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('svg')) return 'svg'
  return 'jpg'
}
