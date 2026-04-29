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
// Naudojimas:
//   import { proxyImg } from '@/lib/img-proxy'
//   <img src={proxyImg(album.cover_image_url)} />
// Jei URL nėra music.lt — grąžinama nepakeista.

const MUSIC_LT_RE = /^https?:\/\/(?:www\.)?music\.lt\//i

export function proxyImg(url: string | null | undefined): string {
  if (!url) return ''
  if (typeof url !== 'string') return ''
  if (!MUSIC_LT_RE.test(url)) return url
  // weserv.nl format: ?url=domain.com/path (be protokolo prefix'o)
  const stripped = url.replace(/^https?:\/\//, '')
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}`
}
