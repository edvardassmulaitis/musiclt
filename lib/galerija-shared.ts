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
  artistId: number | null
  artistName: string | null
  tag: string | null
  groupKey: string     // 'a:<id>' | 't:<tag>' | 'all' — filtravimui
  groupLabel: string   // atlikėjo vardas / tagas / „Bendros"
  aspectRatio: number  // plotis/aukštis (justified layout'ui; default 1.5)
}

/** Reportažo line-up dalyvis (atlikėjas su vaidmeniu). */
export type LineupArtist = {
  id: number
  name: string
  slug: string | null
  role: string | null   // 'headlineris' | 'apšildantis' | 'svečias' | null
}

/** Nuotraukų grupė galerijos filtrui. */
export type PhotoGroup = { key: string; label: string; count: number }

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

/** Lietuviška daiktavardžio forma pagal skaičių: [vienaskaita, dauginė, kilmininkas].
 *  Pvz. ltCount(1,['reportažas','reportažai','reportažų']) → „1 reportažas". */
export function ltCount(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  let form: string
  if (mod10 === 1 && mod100 !== 11) form = forms[0]
  else if (mod10 >= 2 && mod10 <= 9 && (mod100 < 11 || mod100 > 19)) form = forms[1]
  else form = forms[2]
  return `${n} ${form}`
}

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

/** Nuotraukos grupės raktas + etiketė (pagal atlikėją arba tagą). */
export function photoGroup(p: { artistId: number | null; artistName: string | null; tag: string | null }): { key: string; label: string } {
  if (p.artistId) return { key: `a:${p.artistId}`, label: p.artistName || 'Atlikėjas' }
  if (p.tag) return { key: `t:${p.tag}`, label: p.tag }
  return { key: 'all', label: 'Bendros' }
}

/** Sudaro grupių sąrašą iš nuotraukų — atlikėjai (line-up tvarka) → tagai → bendros. */
export function buildPhotoGroups(photos: ReportagePhoto[], lineupOrder: Map<number, number>): PhotoGroup[] {
  const map = new Map<string, { label: string; count: number; sort: number }>()
  for (const p of photos) {
    let sort = 2000
    if (p.artistId) sort = lineupOrder.get(p.artistId) ?? 500
    else if (p.tag) sort = 1000
    const e = map.get(p.groupKey)
    if (e) e.count++
    else map.set(p.groupKey, { label: p.groupLabel, count: 1, sort })
  }
  return [...map.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || a[1].label.localeCompare(b[1].label, 'lt'))
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
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
