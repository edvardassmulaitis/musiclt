// lib/img-proxy.ts
//
// Helper'is paveiksliukų URL'ams. Music.lt'o paveiksliukai blokuojami iš
// dalies mobile browser'ių (matyt CDN UA / IP filter'is). Bandytas Vercel
// Functions proxy — taip pat blokuojamas (Vercel IP'ai bloko sąraše).
// Sprendimas: naudojam images.weserv.nl — viešą image CDN proxy, kuris:
//   - Specialiai sukurtas tokiems use case'ams (skipper'is hot-link block'ams)
//   - Veikia kaip realus browser'is (User-Agent imituoja)
//   - Cache'ina rezultatą savo CDN'e — papildomai pagreitina
//   - Nemokamas, be auth
//   - PALAIKO RESIZE — `&w=1200` grąžina downscale'intą versiją, taupant
//     bandwidth ir paspartinant renderingą (ypač mobile + slow connections).
// Naudojimas:
//   import { proxyImg, proxyImgResized } from '@/lib/img-proxy'
//   <img src={proxyImg(album.cover_image_url)} />              // music.lt only
//   <img src={proxyImgResized(artist.cover_image_url, 1200)} /> // any source, resized

const MUSIC_LT_RE = /^https?:\/\/(?:www\.)?music\.lt\//i
const ALREADY_PROXIED_RE = /^https?:\/\/images\.weserv\.nl\//i

/**
 * Music.lt URL'us proxy'ina per weserv.nl, kitus palieka as-is.
 * Optional `width` — perduoda &w= resize parametrą (px).
 */
export function proxyImg(url: string | null | undefined, width?: number): string {
  if (!url || typeof url !== 'string') return ''
  if (ALREADY_PROXIED_RE.test(url)) {
    // Jau praeinamas weserv.nl — pridedam width jei nurodyta ir dar nėra
    if (width && !/[?&]w=\d+/.test(url)) {
      return url + (url.includes('?') ? '&' : '?') + `w=${width}`
    }
    return url
  }
  if (!MUSIC_LT_RE.test(url)) return url
  const stripped = url.replace(/^https?:\/\//, '')
  const widthParam = width ? `&w=${width}` : ''
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}${widthParam}`
}

/**
 * Pipe'ina BET KOKĮ URL per weserv.nl su priverstine resize. Naudoti hero
 * photo, kortelėms, lightbox preview'ams kur full-res nuotrauka būtų
 * brutali (nepaisant origin). Wikimedia Commons / Supabase originals gali
 * būti 4K+ — su &w=1200 nukerpa atsisiuntimą iki ~150-300KB vietoj 2-5MB.
 *
 * weserv.nl WebP encode'ina automatiškai (modern browser'iai gauna .webp
 * versiją), todėl bandwidth taupomas dar labiau.
 */
export function proxyImgResized(url: string | null | undefined, width: number): string {
  if (!url || typeof url !== 'string') return ''
  if (ALREADY_PROXIED_RE.test(url)) {
    if (!/[?&]w=\d+/.test(url)) {
      return url + (url.includes('?') ? '&' : '?') + `w=${width}`
    }
    return url
  }
  const stripped = url.replace(/^https?:\/\//, '')
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=${width}&output=webp&q=82`
}
