/**
 * POST /api/admin/artists/[id]/rehost-images
 *
 * Rehost'ina visus EXTERNAL (Wikimedia, kt) paveiksliukus pas mus į
 * Supabase Storage `covers` bucket'ą. Po šito atlikėjo nuotraukos
 * nebepriklauso nuo weserv.nl proxy'o (kuris periodiškai 503/404
 * Wikimedia URL'ams — žr. bug 2026-05-19 Anthony Kiedis).
 *
 * Apima:
 *   - artists.cover_image_url       (hero/avatar)
 *   - artists.cover_image_wide_url  (admin-chosen wide hero)
 *   - artist_photos.url             (gallery foto)
 *
 * Praleidžia:
 *   - jau Supabase storage URL'us (`*.supabase.co`)
 *   - music.lt legacy URL'us — palieka kaip yra (jie veikia per weserv
 *     stabiliai; mus apima tik external risk)
 *
 * Body (JSON, optional):
 *   { includeMusicLt?: boolean }  // default false — rehost'inti ir music.lt
 *
 * Response:
 *   { ok, artistId, processed, updated, skipped, errors[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resizeForUpload } from '@/lib/image-resize'

const supabase = createAdminClient()
const MAX_REHOST_BYTES = 25 * 1024 * 1024

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) {
    return null
  }
  return session
}

const SUPABASE_RE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\//i
const MUSIC_LT_RE = /^https?:\/\/(?:www\.)?music\.lt\//i

function isExternal(url: string | null | undefined, includeMusicLt: boolean): boolean {
  if (!url || typeof url !== 'string') return false
  if (SUPABASE_RE.test(url)) return false
  if (!includeMusicLt && MUSIC_LT_RE.test(url)) return false
  return /^https?:\/\//i.test(url)
}

async function fetchAndUpload(url: string): Promise<{ ok: true; newUrl: string } | { ok: false; error: string }> {
  const isWikimedia = /wikimedia\.org|wikipedia\.org/i.test(url)
  const headers: Record<string, string> = {
    'User-Agent': 'MusicLT/1.0 (https://musiclt.vercel.app; music database) Mozilla/5.0',
    'Accept': 'image/*,*/*;q=0.8',
  }
  if (isWikimedia) {
    headers['Referer'] = 'https://en.wikipedia.org/'
    headers['Accept-Language'] = 'en-US,en;q=0.9'
  }

  let response: Response | null = null
  let lastError = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    try {
      response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(20000) })
      if (response.ok) break
      lastError = `HTTP ${response.status}`
      if (response.status === 404 || response.status === 403) break
    } catch (e: any) {
      lastError = String(e?.message || e)
    }
  }
  if (!response?.ok) return { ok: false, error: lastError || 'Fetch failed' }

  const contentType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
  if (!contentType.startsWith('image/')) {
    return { ok: false, error: `Non-image content-type: ${contentType}` }
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength < 200) {
    return { ok: false, error: `Tiny response (${buffer.byteLength}B)` }
  }
  if (buffer.byteLength > MAX_REHOST_BYTES) {
    return { ok: false, error: `Too large (${(buffer.byteLength/1024/1024).toFixed(1)}MB > 25MB)` }
  }

  // Resize/compress: Wikipedia originalai būna 10-20MB — webp q80 1920px sumažina ~5-10x
  const resized = await resizeForUpload(buffer, contentType)
  const filename = `rehost/${Date.now()}-${Math.random().toString(36).slice(2)}.${resized.ext}`

  const { error: uploadError } = await supabase.storage
    .from('covers')
    .upload(filename, resized.buffer, { contentType: resized.contentType, upsert: false })
  if (uploadError) return { ok: false, error: `Upload: ${uploadError.message}` }

  const { data } = supabase.storage.from('covers').getPublicUrl(filename)
  return { ok: true, newUrl: data.publicUrl }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idStr } = await params
  const artistId = Number(idStr)
  if (!Number.isFinite(artistId) || artistId <= 0) {
    return NextResponse.json({ error: 'Bad artist id' }, { status: 400 })
  }

  let body: any = {}
  try { body = await req.json() } catch { /* empty body OK */ }
  const includeMusicLt = body?.includeMusicLt === true

  const errors: { source: string; url: string; error: string }[] = []
  let processed = 0
  let updated = 0
  let skipped = 0

  // 1) Artist'o cover_image_url + cover_image_wide_url
  const { data: artist, error: aErr } = await supabase
    .from('artists')
    .select('id, name, cover_image_url, cover_image_wide_url')
    .eq('id', artistId)
    .single()
  if (aErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }

  const artistUpdates: Record<string, string> = {}
  for (const field of ['cover_image_url', 'cover_image_wide_url'] as const) {
    const url = (artist as any)[field] as string | null
    if (!isExternal(url, includeMusicLt)) { skipped++; continue }
    processed++
    const r = await fetchAndUpload(url!)
    if (r.ok) {
      artistUpdates[field] = r.newUrl
      updated++
    } else {
      errors.push({ source: `artists.${field}`, url: url!, error: r.error })
    }
  }
  if (Object.keys(artistUpdates).length > 0) {
    const { error: upErr } = await supabase.from('artists').update(artistUpdates).eq('id', artistId)
    if (upErr) errors.push({ source: 'artists.update', url: '', error: upErr.message })
  }

  // 2) Gallery photos
  const { data: photos } = await supabase
    .from('artist_photos')
    .select('id, url')
    .eq('artist_id', artistId)
  for (const p of (photos || []) as { id: number; url: string | null }[]) {
    if (!isExternal(p.url, includeMusicLt)) { skipped++; continue }
    processed++
    const r = await fetchAndUpload(p.url!)
    if (r.ok) {
      const { error: upErr } = await supabase.from('artist_photos').update({ url: r.newUrl }).eq('id', p.id)
      if (upErr) {
        errors.push({ source: `artist_photos[${p.id}].update`, url: p.url!, error: upErr.message })
      } else {
        updated++
      }
    } else {
      errors.push({ source: `artist_photos[${p.id}]`, url: p.url!, error: r.error })
    }
  }

  return NextResponse.json({ ok: true, artistId, processed, updated, skipped, errors })
}
