// lib/artist-browse.ts
// Shared helpers for the /atlikejai browse page: country/genre slugs, sort
// keys, flag emojis. Country names DB'oje saugomi pilni LT pavadinimai
// ("Lietuva", "JAV", "Didžioji Britanija"), o URL'uose naudojam slug'us
// ("lietuva", "jav", "didzioji-britanija"). Du special slug'ai:
//   lt    → Lietuva (lietuviški atlikėjai)
//   world → visi NE-Lietuva (užsienio atlikėjai)
// SiteHeader mega-menu jau linkina į ?country=lt ir ?country=world.

export const LT_COUNTRY = 'Lietuva'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://music.lt'

export type SortKey = 'popular' | 'recent' | 'name'
export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'popular', label: 'Populiariausi' },
  { key: 'recent', label: 'Šiuo metu populiaru' },
  { key: 'name', label: 'Pagal abėcėlę' },
]
export function normSort(s?: string | null): SortKey {
  return s === 'recent' || s === 'name' ? s : 'popular'
}

const LT_DIACRITICS: Record<string, string> = {
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
}

export function ltSlugify(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, (c) => LT_DIACRITICS[c] || c)
    .replace(/&/g, ' ir ')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Country resolution ──────────────────────────────────────────────
export type CountryResolution =
  | { mode: 'all' }
  | { mode: 'lt' }
  | { mode: 'world' }
  | { mode: 'name'; name: string }

/** Resolve a country slug from URL into a query directive. `names` is the
 *  list of real DB country names — used to reverse-map a slug to its name. */
export function resolveCountry(slug: string | null | undefined, names: string[]): CountryResolution {
  const s = (slug || '').trim().toLowerCase()
  if (!s || s === 'all' || s === 'visos') return { mode: 'all' }
  if (s === 'lt' || s === 'lietuva') return { mode: 'lt' }
  if (s === 'world' || s === 'uzsienis' || s === 'pasaulis') return { mode: 'world' }
  const match = names.find((n) => ltSlugify(n) === s)
  return match ? { mode: 'name', name: match } : { mode: 'all' }
}

/** The canonical slug stored back in the URL for a resolved country. */
export function countrySlug(res: CountryResolution): string {
  if (res.mode === 'lt') return 'lt'
  if (res.mode === 'world') return 'world'
  if (res.mode === 'name') return ltSlugify(res.name)
  return 'all'
}

// ── Flag emojis for the most common countries (nice touch in the UI) ──
export const COUNTRY_FLAGS: Record<string, string> = {
  Lietuva: '🇱🇹', JAV: '🇺🇸', 'Didžioji Britanija': '🇬🇧', Vokietija: '🇩🇪',
  Švedija: '🇸🇪', Kanada: '🇨🇦', Australija: '🇦🇺', Prancūzija: '🇫🇷',
  Suomija: '🇫🇮', Rusija: '🇷🇺', Italija: '🇮🇹', Norvegija: '🇳🇴',
  Airija: '🇮🇪', Olandija: '🇳🇱', Velsas: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', Škotija: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Latvija: '🇱🇻',
  Japonija: '🇯🇵', Danija: '🇩🇰', Jamaika: '🇯🇲', Meksika: '🇲🇽',
  Austrija: '🇦🇹', 'Pietų Afrikos Respublika': '🇿🇦', 'Puerto Rikas': '🇵🇷',
  Lenkija: '🇵🇱', Ispanija: '🇪🇸', Šveicarija: '🇨🇭', Belgija: '🇧🇪',
  Brazilija: '🇧🇷', Estija: '🇪🇪', Islandija: '🇮🇸', Ukraina: '🇺🇦',
  'Naujoji Zelandija': '🇳🇿', Graikija: '🇬🇷', Vengrija: '🇭🇺', Čekija: '🇨🇿',
  Portugalija: '🇵🇹', Kuba: '🇨🇺', Indija: '🇮🇳', 'Pietų Korėja': '🇰🇷',
}

export function flagFor(country?: string | null): string {
  if (!country) return ''
  return COUNTRY_FLAGS[country] || ''
}
