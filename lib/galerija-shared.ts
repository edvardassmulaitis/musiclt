// lib/galerija-shared.ts
//
// Klientui saugūs tipai + helper'iai foto galerijai (/galerija). Jokio DB / serverio
// importo — naudoja ir server lib (lib/galerija.ts), ir client komponentai.

export type ReportagePhoto = {
  id: number
  url: string          // pilno dydžio
  thumbUrl: string     // peržiūrai (proxy resize)
  caption: string | null
  width: number | null
  height: number | null
}

export type Reportage = {
  id: number
  slug: string
  href: string
  title: string
  intro: string | null
  artistId: number | null
  artistName: string | null
  artistSlug: string | null
  photographerId: number | null
  photographerName: string | null
  photographerSlug: string | null
  eventName: string | null
  venue: string | null
  city: string | null
  eventDate: string | null   // ISO date
  coverUrl: string | null
  photoCount: number
  isFeatured: boolean
  publishedAt: string | null
  flickrAlbumUrl?: string | null
  sourceUrl?: string | null
}

export type Photographer = {
  id: number
  slug: string
  href: string
  name: string
  roleTitle: string | null
  bio: string | null
  avatarUrl: string | null
  websiteUrl: string | null
  instagramUrl: string | null
  facebookUrl: string | null
  flickrUrl: string | null
  reportageCount: number
  photoCount: number
}

export function reportageHref(slug: string): string {
  return `/galerija/${slug}`
}

export function photographerHref(slug: string): string {
  return `/fotografas/${slug}`
}

const LT_MONTHS = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
]

/** „2025 m. spalio 9 d." — renginio data lietuviškai. */
export function formatEventDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()} m. ${LT_MONTHS[d.getMonth()]} ${d.getDate()} d.`
}

/** „Compensa · Vilnius" — vietos eilutė reportažo metaduomenims. */
export function reportagePlaceLine(r: Pick<Reportage, 'venue' | 'city'>): string | null {
  const parts = [r.venue, r.city].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/* ─────────────────────────── Flickr helper'iai ─────────────────────────── */

/** Pastato pilno dydžio Flickr static URL iš server/id/secret. */
export function flickrPhotoUrl(server: string, id: string, secret: string, size = 'b'): string {
  return `https://live.staticflickr.com/${server}/${id}_${secret}_${size}.jpg`
}

/** Ištraukia Flickr albumo (photoset) ID iš įvairaus formato URL. */
export function parseFlickrAlbumId(url: string): string | null {
  const m =
    url.match(/\/albums\/(\d+)/) ||
    url.match(/\/sets\/(\d+)/) ||
    url.match(/in\/album-(\d+)/)
  return m ? m[1] : null
}
