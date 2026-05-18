/**
 * Image attachment processing helper — bendras gmail-ingest endpoint'ui
 * ir backfill'ui.
 *
 * Veiksmų sekvencija:
 *   1) Gauk attachment metadata'ą per Gmail API (getMessageAttachments)
 *   2) Filter image MIME types + size constraints (>1KB, <10MB)
 *   3) Per kiekvieną:
 *      - download buffer (getAttachmentBuffer)
 *      - EXIF extract (photographer/copyright/year/caption)
 *      - upload į 'news-attachments' Storage bucket
 *      - INSERT news_candidate_images row
 *   4) Update'ina candidate.suggested_image_url su pirmojo image URL'u
 *      (backward compat su esamu /admin/inbox UI)
 */

import { getMessageAttachments, getAttachmentBuffer } from './gmail-client'
import { extractExifFromBuffer } from './exif-extract'
import { extractPhotographerFromFilename } from './extract-credits'

export const ATTACHMENTS_BUCKET = 'news-attachments'
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024  // Gmail max 25MB; press release foto dažnai 5-15MB hi-res
const MAX_ATTACHMENTS_PER_CANDIDATE = 15        // Phantom/Opera press release'ai dažnai 10-15 foto
const MIN_IMAGE_BYTES = 1024  // <1KB = greičiausiai tracking pixel ar logo bullet

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'attachment'
}

export interface AttachmentResult {
  processed: number
  failed: number
  first_url: string | null
  errors: string[]
  /** Diagnostic — kiek attachment'ų Gmail API grąžino prieš filtravimą. */
  raw_count: number
  /** Diagnostic — kiek pas image MIME type. */
  image_count: number
  /** Diagnostic — kiek perėjo size filter'į. */
  size_passed: number
  /** Diagnostic — per-attachment summary (filename, mime, size, action). */
  details: Array<{ filename: string; mime: string; size: number; action: 'uploaded' | 'skipped_non_image' | 'skipped_size' | 'failed' }>
}

/**
 * Pagrindinė funkcija — apdoroja message'o image attachments ir įdeda
 * į news_candidate_images. supabase parametras yra SupabaseClient kuris turi
 * .from() ir .storage. Manualiai netipiname kad išvengti svarbo importų,
 * vis tiek runtime per createAdminClient() ateina tinkamas tipas.
 */
/**
 * Optional fallback'as photographer'iui — naudojam kai EXIF tuščias ir filename
 * neturi CREDIT pattern'o. Pateikiamas iš gmail-ingest body-text scan'o.
 */
export async function processMessageAttachments(
  supabase: any,
  candidateId: number,
  messageId: string,
  options: { fallbackPhotographer?: string | null } = {},
): Promise<AttachmentResult> {
  const result: AttachmentResult = {
    processed: 0, failed: 0, first_url: null, errors: [],
    raw_count: 0, image_count: 0, size_passed: 0, details: [],
  }

  let metas
  try {
    metas = await getMessageAttachments(messageId)
  } catch (e: any) {
    result.errors.push(`list attachments: ${e?.message || e}`)
    return result
  }

  result.raw_count = metas.length

  // Tag detalizuotai kas filtruota
  for (const m of metas) {
    if (!/^image\//i.test(m.mimeType)) {
      result.details.push({ filename: m.filename, mime: m.mimeType, size: m.size, action: 'skipped_non_image' })
    } else {
      result.image_count++
      if (m.size < MIN_IMAGE_BYTES || m.size > MAX_ATTACHMENT_BYTES) {
        result.details.push({ filename: m.filename, mime: m.mimeType, size: m.size, action: 'skipped_size' })
      } else {
        result.size_passed++
      }
    }
  }

  const imageMetas = metas
    .filter(m => /^image\//i.test(m.mimeType))
    .filter(m => m.size >= MIN_IMAGE_BYTES && m.size <= MAX_ATTACHMENT_BYTES)
    .slice(0, MAX_ATTACHMENTS_PER_CANDIDATE)

  // Patikrink esamą sort_order'ių max'ą (kad reprocess'inus su daugiau
  // foto, naujos pridėtų po esamų).
  const { data: existingImgs } = await supabase
    .from('news_candidate_images')
    .select('sort_order')
    .eq('candidate_id', candidateId)
    .order('sort_order', { ascending: false })
    .limit(1)
  const startSortOrder = (existingImgs?.[0]?.sort_order ?? -1) + 1

  for (let i = 0; i < imageMetas.length; i++) {
    const m = imageMetas[i]
    try {
      const buf = await getAttachmentBuffer(messageId, m.attachmentId)
      if (buf.length === 0 || buf.length > MAX_ATTACHMENT_BYTES) {
        result.failed++
        continue
      }

      const exif = await extractExifFromBuffer(buf, m.mimeType)

      // Photographer fallback chain: EXIF → filename CREDIT_xxx → body text fallback
      let finalPhotographer = exif.photographer
      if (!finalPhotographer) {
        finalPhotographer = extractPhotographerFromFilename(m.filename)
      }
      if (!finalPhotographer && options.fallbackPhotographer) {
        finalPhotographer = options.fallbackPhotographer
      }

      const safeName = sanitizeFilename(m.filename)
      const storagePath = `gmail/${candidateId}/${Date.now()}-${i}-${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(storagePath, buf, { contentType: m.mimeType, upsert: false })
      if (uploadErr) {
        result.failed++
        result.errors.push(`upload ${m.filename}: ${uploadErr.message}`)
        continue
      }

      const { data: pubData } = supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .getPublicUrl(storagePath)
      const publicUrl = pubData.publicUrl

      const { error: imgInsErr } = await supabase
        .from('news_candidate_images')
        .insert({
          candidate_id: candidateId,
          storage_path: storagePath,
          public_url: publicUrl,
          filename: m.filename,
          mime_type: m.mimeType,
          file_size: buf.length,
          photographer: finalPhotographer,
          copyright: exif.copyright,
          year_taken: exif.year_taken,
          caption_exif: exif.caption_exif,
          caption: exif.caption_exif,
          source: 'email_attachment',
          sort_order: startSortOrder + i,
        })
      if (imgInsErr) {
        result.failed++
        result.errors.push(`insert ${m.filename}: ${imgInsErr.message}`)
        result.details.push({ filename: m.filename, mime: m.mimeType, size: m.size, action: 'failed' })
        continue
      }

      result.processed++
      result.details.push({ filename: m.filename, mime: m.mimeType, size: m.size, action: 'uploaded' })
      if (!result.first_url) result.first_url = publicUrl
    } catch (e: any) {
      result.failed++
      result.errors.push(`attachment ${i}: ${e?.message || e}`)
      result.details.push({ filename: m.filename, mime: m.mimeType, size: m.size, action: 'failed' })
    }
  }

  // Update suggested_image_url tik jeigu candidate'as jo dar neturi
  // (kad neoverwrite'intume admin'o pasirinkimo).
  if (result.first_url) {
    const { data: cand } = await supabase
      .from('news_candidates')
      .select('suggested_image_url')
      .eq('id', candidateId)
      .maybeSingle()
    if (cand && !cand.suggested_image_url) {
      await supabase
        .from('news_candidates')
        .update({ suggested_image_url: result.first_url })
        .eq('id', candidateId)
    }
  }

  return result
}
