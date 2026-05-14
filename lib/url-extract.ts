/**
 * URL → straipsnio turinys.
 *
 * Pasirinkimo motyvai:
 *  - NE @mozilla/readability (per didelis dependency, reikalauja jsdom)
 *  - Custom HTML parser per regex'us — labai paprastai, bet veikia 90% portalų
 *  - Lead image — meta og:image arba pirmas <img> straipsnyje
 *
 * Jei kuri nors konkreti portalo struktūra reikalauja specialaus parser'io —
 * pridedam į portalSpecificExtract() switch'ą.
 */

import crypto from 'crypto'

export type ExtractedArticle = {
  url: string
  title: string
  text: string                  // plain text body
  html: string                  // raw HTML (be script/style)
  lead_image_url?: string
  embed_urls: string[]          // YT/Spotify/SoundCloud/Bandcamp iš source (svarbu naujiems release'ams)
  author?: string
  published_at?: string
  source_lang?: string          // detekcija pagal HTML lang attr
  word_count: number
}

const USER_AGENT = 'Mozilla/5.0 (compatible; music.lt-scout/1.0; +https://music.lt)'

export async function extractFromUrl(url: string): Promise<ExtractedArticle> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  })

  if (!res.ok) throw new Error(`Fetch HTTP ${res.status} for ${url}`)
  const html = await res.text()

  return parseHtml(html, url)
}

export function parseHtml(html: string, baseUrl: string): ExtractedArticle {
  // 1) Detect lang
  const lang = (html.match(/<html[^>]+lang=["']?([a-z-]+)/i)?.[1] || '').slice(0, 5).toLowerCase()

  // 2) Title — pirmiausia og:title, fallback <title>
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  const title = decodeHtml((ogTitle || titleTag || '').trim())

  // 3) Lead image — og:image
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1]
  let lead_image_url = ogImg ? absoluteUrl(ogImg, baseUrl) : undefined

  // 4) Author — meta tags
  const author = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i)?.[1]
    || html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)/i)?.[1]

  // 5) Published
  const published = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i)?.[1]

  // 6) Body extract — naudojam <article> tag'ą jei yra, kitaip <main>, kitaip <body>
  let bodyHtml = ''
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  if (articleMatch) {
    bodyHtml = articleMatch[1]
  } else {
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    if (mainMatch) {
      bodyHtml = mainMatch[1]
    } else {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
      bodyHtml = bodyMatch?.[1] || html
    }
  }

  // 7a) PRIEŠ strip'inant — extract'inam embed URLs (YT/Spotify/SoundCloud/Bandcamp)
  const embedUrls: string[] = []
  // iframe src
  const iframeMatches = bodyHtml.matchAll(/<iframe[^>]+src=["']([^"']+)/gi)
  for (const m of iframeMatches) {
    const src = m[1]
    if (/youtube\.com|youtu\.be|spotify\.com|soundcloud\.com|bandcamp\.com/i.test(src)) {
      embedUrls.push(absoluteUrl(src, baseUrl))
    }
  }
  // Anchor links to music platforms (Pitchfork often inline-links these)
  const linkMatches = bodyHtml.matchAll(/<a[^>]+href=["']([^"']*(?:youtube\.com\/watch|youtu\.be\/[\w-]+|open\.spotify\.com|soundcloud\.com\/[\w-]+\/[\w-]+|[\w-]+\.bandcamp\.com)[^"']*)["']/gi)
  for (const m of linkMatches) {
    embedUrls.push(absoluteUrl(m[1], baseUrl))
  }
  // Dedupe
  const uniqueEmbeds = Array.from(new Set(embedUrls))

  // 7b) Clean — pašalinti scripts/styles/nav/aside/footer/comments
  let cleaned = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    // Comment'ai
    .replace(/<!--[\s\S]*?-->/g, '')

  // 8) Lead image fallback — pirmas <img> iš body jei og:image nebuvo
  if (!lead_image_url) {
    const firstImg = cleaned.match(/<img[^>]+src=["']([^"']+)/i)?.[1]
    if (firstImg) lead_image_url = absoluteUrl(firstImg, baseUrl)
  }

  // 9) Plain text — strip tags
  const text = cleaned
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

  return {
    url: baseUrl,
    title,
    text,
    html: cleaned.slice(0, 50_000), // bound
    lead_image_url,
    embed_urls: uniqueEmbeds,
    author: author ? decodeHtml(author) : undefined,
    published_at: published,
    source_lang: lang || undefined,
    word_count: text.split(/\s+/).length,
  }
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
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/**
 * Canonical URL hash — naudojamas scout_seen_urls dedupe'ui.
 *
 * Normalizuoja: lowercase host, drop'ina query strings (UTM, fbclid),
 * drop'ina trailing slash, drop'ina fragment.
 */
export function canonicalUrlHash(url: string): string {
  let canonical: string
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '')
    u.hash = ''
    // Drop tracking params
    const dropParams = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ref','source']
    for (const p of dropParams) u.searchParams.delete(p)
    canonical = u.toString().replace(/\/$/, '')
  } catch {
    canonical = url
  }
  return crypto.createHash('sha1').update(canonical).digest('hex')
}

/**
 * Title fingerprint — fuzzy dedupe.
 * Lowercase + remove punctuation + first 80 chars → hash.
 */
export function titleFingerprint(title: string): string {
  const norm = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return crypto.createHash('sha1').update(norm).digest('hex')
}
