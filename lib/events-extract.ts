/**
 * Bilietų portalų HTML → event list + per-event detail extractor.
 *
 * Strategija:
 *  1) Pirmiausia ieškom JSON-LD structured data (`<script type="application/ld+json">`
 *     su @type="Event") — daugelis modern portalų juos turi, ten yra pilna struktūra
 *     (startDate, location, offers, image).
 *  2) Fallback'as: per-portal HTML heuristics — paprasti regex'ai kortelės pavadinimui,
 *     datos, ir detail page link'o ištraukimui.
 *
 * Per-portal'iniai patikslinimai (parser_key) leis ateityje fine-tune'inti
 * be Sonnet'o intervencijos.
 */

import crypto from 'crypto'

const USER_AGENT = 'Mozilla/5.0 (compatible; music.lt-events-scout/1.0; +https://music.lt)'

export type EventListItem = {
  url: string              // detail page URL
  title: string
  date_text?: string       // raw date string from listing
  venue_text?: string
  city?: string
  image_url?: string
  price_text?: string
}

export type EventDetail = {
  url: string
  title: string
  description: string      // plain text body
  event_date?: string      // ISO if parseable
  event_date_text?: string // raw fallback
  venue_name?: string
  city?: string
  ticket_url?: string
  price_text?: string
  image_url?: string
  artist_names: string[]   // extracted iš title arba structured data
  source_lang?: string
}

// ─────────────────────────────────────────────────────────────
// 1) List page extractor
// ─────────────────────────────────────────────────────────────

export async function fetchEventList(listUrl: string, parserKey: string): Promise<EventListItem[]> {
  // Special-case: kakava.lt sitemap API (XML su event URLs, ne HTML)
  if (parserKey === 'kakava') {
    return fetchKakavaSitemap(listUrl)
  }

  const res = await fetch(listUrl, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`List fetch HTTP ${res.status} for ${listUrl}`)
  const html = await res.text()

  // First — JSON-LD Event schema (universalu visiem)
  const jsonLdEvents = extractJsonLdEvents(html, listUrl)
  if (jsonLdEvents.length > 0) {
    return jsonLdEvents
  }

  // Fallback per-portal HTML heuristics
  switch (parserKey) {
    case 'bilietai_lt':
      return parseBilietaiLt(html, listUrl)
    case 'tiketa':
      return parseTiketa(html, listUrl)
    default:
      return genericEventList(html, listUrl)
  }
}

/**
 * Kakava.lt naudoja sitemap.xml su pilnu event URL'ų sąrašu.
 * Detail page'us po to fetch'inam atskirai.
 */
async function fetchKakavaSitemap(sitemapUrl: string): Promise<EventListItem[]> {
  const res = await fetch(sitemapUrl, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/xml,text/xml' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Sitemap fetch HTTP ${res.status} for ${sitemapUrl}`)
  const xml = await res.text()

  const items: EventListItem[] = []
  const locRe = /<loc>([^<]+)<\/loc>/g
  for (const m of xml.matchAll(locRe)) {
    const url = m[1].trim()
    // Tik event detail page'us — /lt/events/{ID}/{slug} arba /en/events/{ID}/{slug}
    if (!/\/(?:lt|en)\/events\/\d+\//.test(url)) continue
    items.push({
      url,
      title: '', // bus extract'intas iš detail page'o
    })
    if (items.length >= 50) break
  }
  return items
}

// ─────────────────────────────────────────────────────────────
// 2) Detail page extractor — Sonnet'ui pateikiamas struktūruotas text'as
// ─────────────────────────────────────────────────────────────

export async function fetchEventDetail(url: string): Promise<EventDetail> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Detail fetch HTTP ${res.status} for ${url}`)
  const html = await res.text()

  // JSON-LD first
  const jsonLd = extractFirstJsonLdEvent(html, url)
  if (jsonLd) {
    // Body text iš description + meta
    const text = stripHtml(html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
              || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
              || jsonLd.description || '')
    return {
      ...jsonLd,
      description: text.slice(0, 5000),
    }
  }

  // Fallback'as: extract'inam paprastai
  const lang = (html.match(/<html[^>]+lang=["']?([a-z-]+)/i)?.[1] || '').toLowerCase().slice(0, 5)
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
  const ogDesc = html.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i)?.[1]

  const bodyHtml = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
                 || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
                 || html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
                 || html
  const text = stripHtml(bodyHtml)

  return {
    url,
    title: decodeHtml(ogTitle || titleTag || ''),
    description: text.slice(0, 5000),
    image_url: ogImg ? absoluteUrl(ogImg, url) : undefined,
    artist_names: [],
    source_lang: lang || undefined,
    event_date_text: ogDesc ? extractDateText(ogDesc) : undefined,
  }
}

// ─────────────────────────────────────────────────────────────
// JSON-LD Event extraction (works with most modern ticket portals)
// ─────────────────────────────────────────────────────────────

function extractJsonLdEvents(html: string, baseUrl: string): EventListItem[] {
  const events: EventListItem[] = []
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(scriptRe)) {
    try {
      const raw = m[1].trim()
      const parsed = JSON.parse(raw)
      collectEvents(parsed, events, baseUrl)
    } catch {
      // skip malformed
    }
  }
  return events
}

function collectEvents(node: any, out: EventListItem[], baseUrl: string): void {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) collectEvents(item, out, baseUrl)
    return
  }
  if (typeof node !== 'object') return

  // Handle @graph wrapper
  if (Array.isArray(node['@graph'])) {
    collectEvents(node['@graph'], out, baseUrl)
  }

  const type = node['@type']
  const isEvent = type === 'Event'
              || (Array.isArray(type) && type.includes('Event'))
              || (typeof type === 'string' && /Concert|Festival|MusicEvent/i.test(type))

  if (isEvent && node.name) {
    const url = absoluteUrl(node.url || node.mainEntityOfPage || baseUrl, baseUrl)
    const location = node.location
    const venue = typeof location === 'object'
      ? (location.name || location.address?.streetAddress || '')
      : (typeof location === 'string' ? location : '')
    const city = typeof location === 'object'
      ? (location.address?.addressLocality || location.address?.addressRegion || '')
      : ''
    const image = Array.isArray(node.image) ? node.image[0] : node.image
    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
    const price = offers ? `${offers.price || ''} ${offers.priceCurrency || ''}`.trim() : ''

    out.push({
      url,
      title: String(node.name),
      date_text: node.startDate || '',
      venue_text: venue,
      city,
      image_url: typeof image === 'string' ? image : (image?.url || image?.contentUrl),
      price_text: price || undefined,
    })
  }
}

function extractFirstJsonLdEvent(html: string, url: string): EventDetail | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const m of html.matchAll(scriptRe)) {
    try {
      const raw = m[1].trim()
      const parsed = JSON.parse(raw)
      const event = findEventNode(parsed)
      if (event) {
        const location = event.location
        const venue = typeof location === 'object'
          ? (location.name || '')
          : (typeof location === 'string' ? location : '')
        const city = typeof location === 'object'
          ? (location.address?.addressLocality || '')
          : ''
        const image = Array.isArray(event.image) ? event.image[0] : event.image
        const offers = Array.isArray(event.offers) ? event.offers[0] : event.offers
        const ticketUrl = offers?.url || event.url || ''
        const price = offers ? `${offers.price || ''} ${offers.priceCurrency || ''}`.trim() : ''
        const performers: string[] = []
        const perfNode = Array.isArray(event.performer) ? event.performer : (event.performer ? [event.performer] : [])
        for (const p of perfNode) {
          if (typeof p === 'string') performers.push(p)
          else if (p?.name) performers.push(String(p.name))
        }

        return {
          url,
          title: String(event.name),
          description: String(event.description || ''),
          event_date: event.startDate,
          event_date_text: event.startDate,
          venue_name: venue,
          city,
          ticket_url: typeof ticketUrl === 'string' ? ticketUrl : undefined,
          price_text: price || undefined,
          image_url: typeof image === 'string' ? image : (image?.url || image?.contentUrl),
          artist_names: performers,
        }
      }
    } catch {
      // skip
    }
  }
  return null
}

function findEventNode(node: any): any | null {
  if (!node) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEventNode(item)
      if (found) return found
    }
    return null
  }
  if (typeof node !== 'object') return null
  if (Array.isArray(node['@graph'])) {
    const found = findEventNode(node['@graph'])
    if (found) return found
  }
  const type = node['@type']
  const isEvent = type === 'Event'
              || (Array.isArray(type) && type.includes('Event'))
              || (typeof type === 'string' && /Concert|Festival|MusicEvent/i.test(type))
  if (isEvent && node.name) return node
  return null
}

// ─────────────────────────────────────────────────────────────
// Per-portal HTML heuristics (kai JSON-LD nepakanka)
// ─────────────────────────────────────────────────────────────

function parseBilietaiLt(html: string, baseUrl: string): EventListItem[] {
  // URL pattern'as iš Explore: /renginiai/{ID}/{slug} arba /series/{ID}/{slug}
  // ID gali būti alphanumeric (FPRQYSTDLH) arba numeric
  const items: EventListItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href=["'](\/(?:renginiai|series)\/[A-Z0-9]+\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const url = absoluteUrl(m[1], baseUrl)
    if (seen.has(url)) continue
    seen.add(url)
    const titleRaw = stripHtml(m[2]).trim()
    if (!titleRaw || titleRaw.length < 5) continue
    items.push({
      url,
      title: decodeHtml(titleRaw).slice(0, 200),
    })
    if (items.length >= 50) break
  }
  return items
}

function parseTiketa(html: string, baseUrl: string): EventListItem[] {
  // URL pattern'as iš Explore: /LT/Event/{numericID}
  const items: EventListItem[] = []
  const seen = new Set<string>()
  const re = /<a[^>]+href=["'](\/LT\/Event\/\d+(?:\/[^"'#?]*)?)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const url = absoluteUrl(m[1], baseUrl)
    if (seen.has(url)) continue
    seen.add(url)
    const titleRaw = stripHtml(m[2]).trim()
    if (!titleRaw || titleRaw.length < 5) continue
    items.push({
      url,
      title: decodeHtml(titleRaw).slice(0, 200),
    })
    if (items.length >= 50) break
  }
  return items
}

/**
 * Generic listing extractor — ieško <a> su event-tipo URL pattern + nearby title text.
 * Tas pat veiks 70% portalų kur JSON-LD nėra.
 */
function genericEventList(html: string, baseUrl: string): EventListItem[] {
  const items: EventListItem[] = []
  const seen = new Set<string>()

  // Ieškom anchor'ų į event detail page'us. Common pattern'ai:
  //   /event/, /koncertas/, /renginys/, /concert/
  const re = /<a[^>]+href=["']([^"']*(?:\/event\/|\/events\/|\/koncertas\/|\/renginys\/|\/concert\/|\/concerts\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const m of html.matchAll(re)) {
    const url = absoluteUrl(m[1], baseUrl)
    if (seen.has(url)) continue
    seen.add(url)

    // Title'as — paimam pirmą text content nuvalytą nuo nested HTML
    const titleRaw = stripHtml(m[2]).trim()
    if (!titleRaw || titleRaw.length < 5) continue

    items.push({
      url,
      title: decodeHtml(titleRaw).slice(0, 200),
    })

    if (items.length >= 50) break
  }
  return items
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(p|br|div|h[1-6]|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function absoluteUrl(href: string, base: string): string {
  try { return new URL(href, base).toString() } catch { return href }
}

function extractDateText(s: string): string | undefined {
  // Heuristika datai: 2026-09-15, 09/15/2026, 2026 m. rugsėjo 15 d., ir kt.
  const isoMatch = s.match(/\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]
  const ltMatch = s.match(/\d{4}\s*m\.\s*\w+\s*\d{1,2}\s*d\./)
  if (ltMatch) return ltMatch[0]
  return undefined
}

/**
 * Canonical hash event'o fingerprint'ui: sha1(normalized_title|date|city)
 */
export function eventFingerprint(title: string, dateText?: string, city?: string): string {
  const norm = title.toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const dateNorm = (dateText || '').replace(/\D/g, '').slice(0, 8)
  const cityNorm = (city || '').toLowerCase().slice(0, 40)
  return crypto.createHash('sha1').update(`${norm}|${dateNorm}|${cityNorm}`).digest('hex')
}

export function eventUrlHash(url: string): string {
  let canonical = url
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
    u.hash = ''
    const drop = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ref']
    for (const p of drop) u.searchParams.delete(p)
    canonical = u.toString().replace(/\/$/, '')
  } catch {}
  return crypto.createHash('sha1').update(canonical).digest('hex')
}
