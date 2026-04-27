// lib/img-proxy.ts
//
// Helper'is paveiksliukų URL'ams. Music.lt'o paveiksliukai blokuojami iš
// dalies mobilių browser'ių (matyt CDN UA / IP filter'is), todėl visus
// music.lt URL'us route'inam per /api/proxy-image, kuris server-side
// fetch'ina ir streamina atgal klientui — Vercel Functions IP'ai yra
// whitelist'inti music.lt'o.
//
// Naudojimas:
//   import { proxyImg } from '@/lib/img-proxy'
//   <img src={proxyImg(album.cover_image_url)} />
// Jei URL nėra music.lt — grąžinama nepakeista.

const MUSIC_LT_RE = /^https?:\/\/(?:www\.)?music\.lt\//i

export function proxyImg(url: string | null | undefined): string {
  if (!url) return ''
  if (typeof url !== 'string') return ''
  if (!MUSIC_LT_RE.test(url)) return url
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
}
