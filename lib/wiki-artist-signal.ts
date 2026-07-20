/**
 * Wikipedia „ar atlikėjas vertas sukūrimo" signalas — nesamačiam (be katalogo
 * atlikėjo) kandidatui. Pagrindinis rodiklis: Wikipedia straipsnio VIDUTINIS
 * mėnesinis peržiūrų skaičius (pageviews) — geriausias populiarumo proxy „plius/minus".
 * Papildomai: trumpas aprašymas (kas per atlikėjas).
 *
 * Viskas — vieši Wikipedia/Wikimedia API (veikia serveryje). Best-effort: klaidos
 * negriauna — grąžina null laukus.
 */

const WIKI_UA: Record<string, string> = {
  'User-Agent': 'musiclt/1.0 (https://musiclt.vercel.app; artist scout)',
  Accept: 'application/json',
}

const MUSIC_QUALIFIER = /\((band|musician|singer|rapper|duo|group|dj|record producer|singer-songwriter|musical group|drummer|guitarist|producer)\)/i

export type ArtistSignal = {
  article: string | null
  /** Vidutinis mėnesinis Wikipedia peržiūrų skaičius (paskutiniai pilni mėnesiai). */
  pageviews_monthly: number | null
  description: string | null
}

/** Suranda tinkamiausią atlikėjo straipsnio pavadinimą (vengiant disambiguation
 *  puslapių — pirmenybė „(band)/(musician)/…" variantui). */
async function resolveArticle(artistName: string): Promise<string | null> {
  const name = (artistName || '').trim()
  if (!name) return null
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=8&format=json&origin=*`
    const r = await fetch(url, { headers: WIKI_UA, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = await r.json()
    const hits: any[] = j?.query?.search || []
    if (!hits.length) return null
    const low = name.toLowerCase()
    // 1) „Vardas (band/musician/…)" — muzikinis kvalifikatorius (apeina disambiguation).
    const qualified = hits.find(h => (h.title || '').toLowerCase().startsWith(low) && MUSIC_QUALIFIER.test(h.title || ''))
    if (qualified) return qualified.title
    // 2) Tikslus vardo atitikmuo.
    const exact = hits.find(h => (h.title || '').toLowerCase() === low)
    if (exact) return exact.title
    // 3) Prasideda vardu.
    const starts = hits.find(h => (h.title || '').toLowerCase().startsWith(low))
    if (starts) return starts.title
    // 4) Pirmas.
    return hits[0].title || null
  } catch {
    return null
  }
}

/** Vidutinis mėnesinis peržiūrų skaičius (paskutiniai pilni mėnesiai). */
async function fetchPageviews(title: string): Promise<number | null> {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) // šio mėn. 1 d.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1))
  const fmt = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  const art = encodeURIComponent(title.replace(/ /g, '_'))
  try {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${art}/monthly/${fmt(start)}/${fmt(end)}`
    const r = await fetch(url, { headers: WIKI_UA, signal: AbortSignal.timeout(9000) })
    if (!r.ok) return null
    const j = await r.json()
    const items: any[] = j?.items || []
    if (!items.length) return null
    const vals = items.map((it) => it.views || 0)
    return Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
  } catch {
    return null
  }
}

/** Trumpas aprašymas (kas per atlikėjas) iš REST summary. */
async function fetchDescription(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
    const r = await fetch(url, { headers: WIKI_UA, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const j = await r.json()
    if (j?.description) return String(j.description).slice(0, 120)
    if (j?.extract) return String(j.extract).split('. ')[0].slice(0, 120)
    return null
  } catch {
    return null
  }
}

export async function fetchArtistSignal(artistName: string, articleHint?: string | null): Promise<ArtistSignal> {
  const article = (articleHint && articleHint.trim()) || await resolveArticle(artistName)
  if (!article) return { article: null, pageviews_monthly: null, description: null }
  const [pv, desc] = await Promise.all([fetchPageviews(article), fetchDescription(article)])
  return { article, pageviews_monthly: pv, description: desc }
}
