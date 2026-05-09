/**
 * YouTube InnerTube WEB API helper'iai.
 *
 * Naudojami:
 *   - /api/search/ytmusic  — search for video by "{artist} {title}"
 *   - /api/admin/yt/...    — enrichment route'ai (server-side)
 *
 * InnerTube tai vidinis YouTube API, kuris naudojamas pačiame www.youtube.com
 * frontend'e. Be API key, be quotos. Atsako struktūra didelė ir keičiama —
 * laikomės defensyvių parser'ių (try/optional chaining).
 */
const YT_SEARCH_ENDPOINT = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
const YT_PLAYER_ENDPOINT = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20241120.01.00',
    hl: 'en',
    gl: 'US',
  },
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type YtSearchResult = {
  videoId: string
  title: string
  channel: string
  duration: string
  /** Žmoniškas tekstas iš search'o (pvz "1.2M views" / "1 234 views"). Aproksimacija. */
  views: string
}

function parseSearchResults(data: any): YtSearchResult[] {
  const results: YtSearchResult[] = []
  try {
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
    if (!contents) return results

    for (const section of contents) {
      const items = section?.itemSectionRenderer?.contents
      if (!items) continue

      for (const item of items) {
        const video = item?.videoRenderer
        if (!video?.videoId) continue

        // Skip live streams ir premieres
        const badges = video.badges || []
        const isLive = badges.some((b: any) => b?.metadataBadgeRenderer?.label?.toLowerCase()?.includes('live'))
        if (isLive) continue

        const title = video.title?.runs?.map((r: any) => r.text).join('') || ''
        const channel = video.ownerText?.runs?.map((r: any) => r.text).join('') || ''
        const duration = video.lengthText?.simpleText || ''
        const views = video.viewCountText?.simpleText || ''

        if (!duration) continue // skip live/premiere

        results.push({ videoId: video.videoId, title, channel, duration, views })
      }
    }
  } catch (e) {
    console.error('[yt-innertube] search parse error:', e)
  }
  return results
}

/** Search YouTube. Grąžina iki 5 video kandidatų prioritizuojant „official music video". */
export async function searchYouTube(query: string): Promise<YtSearchResult[]> {
  const searchQuery = query + ' official music video'
  const res = await fetch(YT_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, query: searchQuery }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`YouTube search ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return parseSearchResults(data).slice(0, 5)
}

export type YtVideoDetails = {
  videoId: string
  title: string
  /** Tikslus view count (BIGINT-tinkamas — InnerTube grąžina string, mes parsinam į number). */
  viewCount: number
  channelId: string | null
  isPrivate: boolean
  /** Iš kurio source'o gavome viewCount — tinkamas debug'ui. */
  source?: 'watch_page' | 'player_api' | 'search_text'
}

/** Žmoniško "1.2M views" / "1,234,567 views" parsinimas į tikslų skaičių (apytikslis). */
function parseHumanViewCount(text: string): number {
  if (!text) return 0
  const m = text.match(/([\d,.\s]+)\s*([KkMmBb]?)/)
  if (!m) return 0
  const numStr = m[1].replace(/[\s,]/g, '')
  const num = parseFloat(numStr)
  if (!Number.isFinite(num)) return 0
  const mult = m[2] === 'K' || m[2] === 'k' ? 1e3
             : m[2] === 'M' || m[2] === 'm' ? 1e6
             : m[2] === 'B' || m[2] === 'b' ? 1e9
             : 1
  return Math.round(num * mult)
}

/** Source A — watch puslapis. Pigiausias, bet Vercel'is gauna tuščias atsakas
 *  daugumai kviečiamų video (apsauga prieš bot'us). */
async function tryWatchPage(videoId: string): Promise<YtVideoDetails | null> {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en&gl=US&bpctr=9999999999&has_verified=1`, {
    method: 'GET',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+999',
    },
  })
  if (!res.ok) return null
  const html = await res.text()
  const viewMatch = html.match(/"viewCount":"(\d+)"/)
  if (!viewMatch) return null
  const viewCount = parseInt(viewMatch[1], 10)
  if (!Number.isFinite(viewCount)) return null
  let title = ''
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  if (titleMatch) title = titleMatch[1].replace(/\s*-\s*YouTube\s*$/, '').trim()
  let channelId: string | null = null
  const cidMatch = html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/)
  if (cidMatch) channelId = cidMatch[1]
  const isPrivate = /"status":"LOGIN_REQUIRED"/i.test(html.slice(0, 50000))
  return { videoId, title, viewCount, channelId, isPrivate, source: 'watch_page' }
}

/** Source B — InnerTube /player POST. Iš sandbox'ų veikia, iš Vercel'io kartais 400. */
async function tryPlayerApi(videoId: string): Promise<YtVideoDetails | null> {
  const res = await fetch(YT_PLAYER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, videoId }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data) return null
  const details = data?.videoDetails
  if (!details?.videoId) return null
  const viewCount = parseInt(details.viewCount || '0', 10)
  if (!Number.isFinite(viewCount) || viewCount <= 0) return null
  const playability = data?.playabilityStatus?.status
  const isPrivate = playability === 'LOGIN_REQUIRED' || playability === 'ERROR'
  return {
    videoId: details.videoId,
    title: details.title || '',
    viewCount,
    channelId: details.channelId || null,
    isPrivate,
    source: 'player_api',
  }
}

/** Source C — search'o "1.2M views" tekstas. Aproksimacija, bet bent kažkoks skaičius
 *  trend'ams. Naudojam tik kaip last-resort, nes precision prarandama. */
async function trySearchText(videoId: string): Promise<YtVideoDetails | null> {
  // Negrąžina viewCount'o specifiniam videoId. Pulsime patį title'ą su videoId
  // ir tikėsimės, kad pirmas hit'as bus jis. Tai neoptimalu, bet veikia kaip
  // backup — ne visiems track'ams kviečiam, tik kaip fallback.
  const res = await fetch(YT_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ context: INNERTUBE_CONTEXT, query: videoId }),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  if (!data) return null
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
  if (!contents) return null
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents
    if (!items) continue
    for (const item of items) {
      const v = item?.videoRenderer
      if (v?.videoId === videoId) {
        const viewsText = v.viewCountText?.simpleText || ''
        const viewCount = parseHumanViewCount(viewsText)
        if (viewCount <= 0) return null
        const title = v.title?.runs?.map((r: any) => r.text).join('') || ''
        return { videoId, title, viewCount, channelId: null, isPrivate: false, source: 'search_text' }
      }
    }
  }
  return null
}

/**
 * Gauna view count + meta. Bandomas fallback chain'as:
 *   1) watch puslapis     — tikslus, dažnai veikia, tikėtinai gauna ratelimit'ą
 *   2) /player InnerTube  — tikslus, geriau dirba iš sandbox'ų
 *   3) search-text        — APROKSIMACIJA iš "1.2M views" string'o (last resort)
 *
 * Grąžinamas pirmasis sėkmingas — `source` rodo, kuris suveikė.
 * Pirmasis source per visą artist'o run'ą su didžiausia tikimybe pavyks; jei jis
 * nepavyks (rate-limit), pereinam į kitą.
 */
export async function getVideoDetails(videoId: string): Promise<YtVideoDetails | null> {
  const sources: Array<(id: string) => Promise<YtVideoDetails | null>> = [
    tryWatchPage,
    tryPlayerApi,
    trySearchText,
  ]
  for (const src of sources) {
    try {
      const r = await src(videoId)
      if (r && r.viewCount > 0) return r
    } catch {
      // Bandome kitą source
    }
  }
  return null
}

/** Ištraukia videoId iš įvairaus pavidalo YT URL. Grąžina null jei neatpažįsta. */
export function extractVideoIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{6,})/,           // youtube.com/watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{6,})/,       // youtu.be/ID
    /youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/, // embed URL
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/, // shorts URL
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}
