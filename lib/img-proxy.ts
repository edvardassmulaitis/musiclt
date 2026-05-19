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
// Mūsų pačių Supabase storage — nieks proxy'inti nereikia, ten jau yra
// CDN-edge cache + WebP transformer ant Storage v2 (jei reik resize).
const OWN_STORAGE_RE = /^https?:\/\/[a-z0-9-]+\.supabase\.co\//i

/**
 * weserv.nl-friendly canonical: visada pateikiam pilną URL su `https://`.
 * Be protocol'o weserv.nl pridėdavo `http://` ir Wikimedia (HTTPS-only)
 * redirect'o nesusidorodavo — gauni 404/503 (žr. bug 2026-05-19 ant
 * Anthony Kiedis: `upload.wikimedia.org/...` be `https://` → 404 nuo
 * weserv.nl, su `https://` → 200).
 */
function canonicalUpstream(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return 'https:' + url
  return 'https://' + url
}

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
  const canonical = canonicalUpstream(url)
  const widthParam = width ? `&w=${width}` : ''
  return `https://images.weserv.nl/?url=${encodeURIComponent(canonical)}${widthParam}`
}

/**
 * Pipe'ina BET KOKĮ URL per weserv.nl su priverstine resize. Naudoti hero
 * photo, kortelėms, lightbox preview'ams kur full-res nuotrauka būtų
 * brutali (nepaisant origin). Wikimedia Commons / Supabase originals gali
 * būti 4K+ — su &w=1200 nukerpa atsisiuntimą iki ~150-300KB vietoj 2-5MB.
 *
 * Mūsų Supabase storage URL'us PALIEKA AS-IS — jokio weserv hop'o, nes:
 *   (a) Supabase Storage jau turi edge CDN cache'ą
 *   (b) weserv.nl yra single point of failure (žr. 503/404 bug 2026-05-19)
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
  // Mūsų storage — jokio proxy
  if (OWN_STORAGE_RE.test(url)) return url
  const canonical = canonicalUpstream(url)
  return `https://images.weserv.nl/?url=${encodeURIComponent(canonical)}&w=${width}&output=webp&q=82`
}
