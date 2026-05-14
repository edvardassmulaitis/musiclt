/**
 * RSS feed parser news-scout'ui.
 *
 * Naudoja paprasčiausią regex'inį XML parser'į (be xml2js dependency'os).
 * Šito užtenka RSS 2.0 / Atom feed'ams — visi mūsų source'ai naudoja juos.
 *
 * Per-portal specific extraction'as gyvena `extractFromUrl()` (lib/url-extract.ts),
 * bet jei reikia portal'o specifinio body cleaner'io — pridedam į
 * `portalOverrides` map'ą šitame faile.
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; music.lt-scout/1.0; +https://music.lt)'

export type FeedItem = {
  url: string
  title: string
  summary?: string             // <description> / <summary>
  published_at?: string
  guid?: string
}

/**
 * Universal RSS/Atom feed parser.
 */
export async function fetchFeed(feedUrl: string): Promise<FeedItem[]> {
  const res = await fetch(feedUrl, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml,application/atom+xml,application/xml' },
    redirect: 'follow',
  })

  if (!res.ok) throw new Error(`Feed fetch HTTP ${res.status} for ${feedUrl}`)
  const xml = await res.text()

  // Atom vs RSS detection
  if (xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"')) {
    return parseAtom(xml)
  }
  return parseRss(xml)
}

// ─────────────────────────────────────────────────────────────
// RSS 2.0 parser
// ─────────────────────────────────────────────────────────────

function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  const itemRegex = /<item[\s>][\s\S]*?<\/item>/gi
  const matches = xml.match(itemRegex) || []

  for (const item of matches) {
    const url = extractTag(item, 'link') || extractTag(item, 'guid')
    if (!url) continue

    const title = extractTag(item, 'title')
    if (!title) continue

    items.push({
      url: url.trim(),
      title: decodeXml(title.trim()),
      summary: cleanSummary(extractTag(item, 'description') || extractTag(item, 'content:encoded') || ''),
      published_at: extractTag(item, 'pubDate') || extractTag(item, 'dc:date'),
      guid: extractTag(item, 'guid') || undefined,
    })
  }

  return items
}

// ─────────────────────────────────────────────────────────────
// Atom parser
// ─────────────────────────────────────────────────────────────

function parseAtom(xml: string): FeedItem[] {
  const items: FeedItem[] = []
  const entryRegex = /<entry[\s>][\s\S]*?<\/entry>/gi
  const matches = xml.match(entryRegex) || []

  for (const entry of matches) {
    // Atom link: <link rel="alternate" href="..."/>
    const linkMatch = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i)
                  || entry.match(/<link[^>]+href=["']([^"']+)["']/i)
    const url = linkMatch?.[1]
    if (!url) continue

    const title = extractTag(entry, 'title')
    if (!title) continue

    items.push({
      url: url.trim(),
      title: decodeXml(title.trim()),
      summary: cleanSummary(extractTag(entry, 'summary') || extractTag(entry, 'content') || ''),
      published_at: extractTag(entry, 'published') || extractTag(entry, 'updated'),
      guid: extractTag(entry, 'id') || undefined,
    })
  }

  return items
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string | undefined {
  // CDATA aware: <tag><![CDATA[...]]></tag> arba <tag>...</tag>
  const cdataRe = new RegExp(`<${escapeRe(tag)}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\/${escapeRe(tag)}>`, 'i')
  const cdataMatch = xml.match(cdataRe)
  if (cdataMatch) return cdataMatch[1]

  const re = new RegExp(`<${escapeRe(tag)}[^>]*>([\\s\\S]*?)<\/${escapeRe(tag)}>`, 'i')
  const m = xml.match(re)
  return m?.[1]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .trim()
}

function cleanSummary(raw: string): string {
  return decodeXml(
    raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
  )
}
