/**
 * Wikipedia „ar atlikėjas vertas / kiek žinomas" signalas iš mėnesinių peržiūrų
 * (pageviews) — populiarumo proxy. Papildomai: trumpas aprašymas.
 *
 * KALBA svarbi: LT atlikėjams naudojam lt.wikipedia (EN peržiūros LT atlikėjams
 * beveik nulinės ir iškraipytų), tarptautiniams — en.wikipedia.
 *
 * Skirtumas tarp „nėra straipsnio" (article=null → tikra 0) ir „nepavyko gauti
 * peržiūrų" (article yra, bet pageviews=null → throttle/klaida, VĖLIAU bandom):
 * cron'as pagal tai NEsaugo klaidingo 0.
 */

const WIKI_UA: Record<string, string> = {
  'User-Agent': 'musiclt/1.0 (https://musiclt.vercel.app; artist scout)',
  Accept: 'application/json',
}

const MUSIC_QUALIFIER = /\((band|musician|singer|rapper|duo|group|dj|record producer|singer-songwriter|musical group|drummer|guitarist|producer|atlikėjas|grupė|dainininkas|dainininkė)\)/i

async function fetchJsonRetry(url: string, timeoutMs = 9000): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 500))
    try {
      const res = await fetch(url, { headers: WIKI_UA, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 429 || res.status >= 500) continue // throttle/serverio klaida → retry
      if (!res.ok) return null // 404 ir pan. — nėra ką bandyti
      return await res.json()
    } catch {
      // timeout/tinklas → retry
    }
  }
  return null
}

export type ArtistSignal = {
  article: string | null
  pageviews_monthly: number | null
  description: string | null
}

/** Suranda tinkamiausią straipsnio pavadinimą (vengiant disambiguation). */
async function resolveArticle(artistName: string, lang: string): Promise<string | null> {
  const name = (artistName || '').trim()
  if (!name) return null
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=8&format=json&origin=*`
  const j = await fetchJsonRetry(url, 8000)
  const hits: any[] = j?.query?.search || []
  if (!hits.length) return null
  const low = name.toLowerCase()
  const qualified = hits.find(h => (h.title || '').toLowerCase().startsWith(low) && MUSIC_QUALIFIER.test(h.title || ''))
  if (qualified) return qualified.title
  const exact = hits.find(h => (h.title || '').toLowerCase() === low)
  if (exact) return exact.title
  const starts = hits.find(h => (h.title || '').toLowerCase().startsWith(low))
  if (starts) return starts.title
  return hits[0].title || null
}

/** Vidutinis mėnesinis peržiūrų skaičius (paskutiniai pilni mėnesiai). null =
 *  nepavyko gauti (throttle/klaida) — NE tas pats kaip 0. */
async function fetchPageviews(title: string, lang: string): Promise<number | null> {
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 4, 1))
  const fmt = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  const art = encodeURIComponent(title.replace(/ /g, '_'))
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/all-agents/${art}/monthly/${fmt(start)}/${fmt(end)}`
  const j = await fetchJsonRetry(url, 9000)
  if (!j) return null
  const items: any[] = j?.items || []
  if (!items.length) return null
  const vals = items.map((it) => it.views || 0)
  return Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
}

async function fetchDescription(title: string, lang: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`
  const j = await fetchJsonRetry(url, 8000)
  if (!j) return null
  if (j?.description) return String(j.description).slice(0, 120)
  if (j?.extract) return String(j.extract).split('. ')[0].slice(0, 120)
  return null
}

export async function fetchArtistSignal(artistName: string, opts?: { lang?: string; articleHint?: string | null }): Promise<ArtistSignal> {
  const lang = opts?.lang || 'en'
  const article = (opts?.articleHint && opts.articleHint.trim()) || await resolveArticle(artistName, lang)
  if (!article) return { article: null, pageviews_monthly: null, description: null }
  const [pv, desc] = await Promise.all([fetchPageviews(article, lang), fetchDescription(article, lang)])
  return { article, pageviews_monthly: pv, description: desc }
}

/** Lengvesnė versija — TIK peržiūros (be aprašymo); masiniam backfill'ui. */
export async function fetchArtistPageviews(artistName: string, opts?: { lang?: string; articleHint?: string | null }): Promise<{ article: string | null; pageviews_monthly: number | null }> {
  const lang = opts?.lang || 'en'
  const article = (opts?.articleHint && opts.articleHint.trim()) || await resolveArticle(artistName, lang)
  if (!article) return { article: null, pageviews_monthly: null }
  return { article, pageviews_monthly: await fetchPageviews(article, lang) }
}
