// lib/news-shared.ts
//
// Client-safe naujienų tipai + formatteriai. JOKIŲ server-only import'ų
// (createAdminClient ir pan.) — kad būtų galima naudoti ir client komponentuose
// (NewsGrid, NewsCard) ir serverio data sluoksnyje (lib/news-feed.ts).

export type NewsFeedItem = {
  uid: string
  href: string
  slug: string
  title: string
  date: string | null
  image: string | null
  category: string | null
  source: 'modern' | 'legacy'
  likeCount: number
  commentCount: number
  viewCount: number
  artistId: number | null
  artistName: string | null
  artistSlug: string | null
  isLT: boolean
  excerpt: string
}

const LT_MONTHS = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
]

/** „2026 m. birželio 3 d." */
export function fmtNewsDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()} m. ${LT_MONTHS[d.getMonth()]} ${d.getDate()} d.`
}

/** Trumpas reliatyvus laikas: „prieš 3 d.", „prieš 2 mėn.", arba data. */
export function relNewsDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const day = 86_400_000
  if (diff < day) return 'šiandien'
  if (diff < 2 * day) return 'vakar'
  if (diff < 7 * day) return `prieš ${Math.floor(diff / day)} d.`
  if (diff < 31 * day) return `prieš ${Math.floor(diff / (7 * day))} sav.`
  if (diff < 365 * day) return `prieš ${Math.floor(diff / (30 * day))} mėn.`
  return `${d.getFullYear()} m.`
}
