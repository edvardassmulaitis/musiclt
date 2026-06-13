// lib/galerija-import.ts
//
// SERVER-only helper'iai galerijos foto importui:
//   • extractFlickrAlbum — paima Flickr albumo (photoset) HTML ir ištraukia
//     nuotraukų static URL'us (page server-render'ina photoset modelį).
//   • rehostImage — parsisiunčia nuotrauką ir įkelia į mūsų `covers` bucket'ą
//     (resize 1920px webp), grąžina durable public URL.

import { createClient } from '@supabase/supabase-js'
import { resizeForUpload } from '@/lib/image-resize'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

export type FlickrPhoto = {
  flickrId: string
  url: string        // pilno dydžio static URL (_b = 1024)
}

/**
 * Ištraukia Flickr albumo nuotraukas. Grąžina unikalias (pagal photo id) URL'us
 * pasirodymo tvarka. Naudoja static URL pattern'ą `{server}/{id}_{secret}_{size}`.
 */
export async function extractFlickrAlbum(albumUrl: string): Promise<FlickrPhoto[]> {
  const res = await fetch(albumUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Flickr HTTP ${res.status}`)
  const html = await res.text()

  // staticflickr URL'ai HTML'e gali būti su escape'intu slash'u (\/) — normalizuojam.
  const norm = html.replace(/\\\//g, '/')
  const re = /live\.staticflickr\.com\/(\d+)\/(\d{8,})_([0-9a-f]+)_[a-z0-9]+\.(?:jpg|jpeg)/gi

  const seen = new Set<string>()
  const out: FlickrPhoto[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(norm)) !== null) {
    const [, server, id, secret] = m
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ flickrId: id, url: `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg` })
    if (out.length >= 300) break
  }
  return out
}

/** Parsisiunčia nuotrauką ir įkelia į `covers` bucket'ą; grąžina public URL. */
export async function rehostImage(sourceUrl: string): Promise<string> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const resp = await fetch(sourceUrl, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*,*/*;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  })
  if (!resp.ok) throw new Error(`Fetch ${resp.status}`)
  const contentType = resp.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await resp.arrayBuffer())
  if (buffer.length > 25 * 1024 * 1024) throw new Error('Per didelis failas')
  const resized = await resizeForUpload(buffer, contentType)
  const filename = `galerija/${Date.now()}-${Math.random().toString(36).slice(2)}.${resized.ext}`
  const { error } = await supabase.storage
    .from('covers')
    .upload(filename, resized.buffer, { contentType: resized.contentType, upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('covers').getPublicUrl(filename)
  return data.publicUrl
}
