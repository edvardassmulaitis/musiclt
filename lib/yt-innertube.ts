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
  /** ISO timestamp kada video įkeltas į YouTube. Iš Data API'o `snippet.publishedAt`
   *  arba watch page'o JSON-LD `uploadDate`. Naudojamas:
   *   - LT atlikėjams kaip release date proxy (oficialių singlų dažnai nėra)
   *   - views/day rate'ui apskaičiuoti (kaip greitai surinkta) */
  uploadedAt?: string | null
  /** Iš kurio source'o gavome viewCount — tinkamas debug'ui. */
  source?: 'data_api' | 'watch_page' | 'player_api' | 'search_text'
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

/** Source 0 (PIRMINIS) — YouTube Data API v3. Auth'enticated, patikimas,
 *  veikia ir iš Vercel'io (kur InnerTube'as dažnai bot-blocked). Naudoja
 *  YOUTUBE_API_KEY env var — tas pats kuris jau dirba `/api/yt/embeddable`.
 *
 *  Quota: 1 unit už statistics + 1 už status (dinaminei kombinacijai),
 *  default daily quota 10k → ~5k video užklausos / diena. Coldplay'aus
 *  150 tracks = 150 units, OK budget'as.
 *
 *  Jei API key nenustatytas — grąžina null ir tęsiame į InnerTube fallback'us. */
async function tryYtDataApi(videoId: string): Promise<YtVideoDetails | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,status&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = (await res.json()) as any
    const item = data?.items?.[0]
    if (!item) {
      // Data API grąžino tuščią items — video ištrintas, channel pašalintas
      // ar region-blocked visiems. Sugeneruojam „virtual private" rezultatą,
      // kad enrich logika clear'intų video_url (nes track'as su mirusiu
      // video naviguojant pagal-tabs sukelia 0-views ar embed klaidas).
      return {
        videoId,
        title: '',
        viewCount: 0,
        channelId: null,
        isPrivate: true,  // ← treat „missing" same as „private" → clear
        source: 'data_api',
      }
    }
    const viewCount = parseInt(item?.statistics?.viewCount || '0', 10)
    if (!Number.isFinite(viewCount) || viewCount <= 0) return null
    const title = item?.snippet?.title || ''
    const channelId = item?.snippet?.channelId || null
    const isPrivate = item?.status?.privacyStatus === 'private'
    // publishedAt iš Data API yra ISO 8601, pvz "2008-09-26T05:00:00Z".
    // Saugom kaip-yra (timestamptz parsing'ą daro Postgres).
    const uploadedAt: string | null = item?.snippet?.publishedAt || null
    return { videoId, title, viewCount, channelId, isPrivate, uploadedAt, source: 'data_api' }
  } catch {
    return null
  }
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
  // uploadDate — JSON-LD blokas YouTube'o watch page'e arba `publishDate`
  // ar `datePublished` itemprop'as. Pirmasis match'as wins (visi vienodi).
  let uploadedAt: string | null = null
  const upM = html.match(/"uploadDate":"([^"]+)"/) || html.match(/itemprop="datePublished"\s+content="([^"]+)"/)
  if (upM) uploadedAt = upM[1]
  return { videoId, title, viewCount, channelId, isPrivate, uploadedAt, source: 'watch_page' }
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
  // uploadDate iš InnerTube microformat'o. Watch page / Data API ne visada
  // suveikia iš Vercel'io (bot block / quota); be šio fallback'as grąžindavo
  // views BE datos, todėl release_year/month/day likdavo tušti (quick-add bug).
  const mf = data?.microformat?.playerMicroformatRenderer
  const uploadedAt: string | null = mf?.uploadDate || mf?.publishDate || null
  return {
    videoId: details.videoId,
    title: details.title || '',
    viewCount,
    channelId: details.channelId || null,
    isPrivate,
    uploadedAt,
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
 *   0) YouTube Data API v3   — patikimas, oficialus (jei YOUTUBE_API_KEY set)
 *   1) watch puslapis        — tikslus, dažnai veikia, Vercel'is dažnai
 *                              bot-blocked
 *   2) /player InnerTube     — tikslus, geriau dirba iš sandbox'ų
 *   3) search-text           — APROKSIMACIJA iš "1.2M views" string'o (last resort)
 *
 * Grąžinamas pirmasis sėkmingas — `source` rodo, kuris suveikė.
 * Data API turi prioritetą, nes jis tinkamiausias Vercel server-side
 * kontekstui (kitur InnerTube'as ratelimitins/blokuoja). InnerTube
 * fallback'ai išlaikomi, kad enrichment'as veiktų ir be API key
 * (pvz. development environment'e).
 */
export async function getVideoDetails(videoId: string): Promise<YtVideoDetails | null> {
  const sources: Array<(id: string) => Promise<YtVideoDetails | null>> = [
    tryYtDataApi,
    tryWatchPage,
    tryPlayerApi,
    trySearchText,
  ]
  let winner: YtVideoDetails | null = null
  let winnerSrc: ((id: string) => Promise<YtVideoDetails | null>) | null = null
  for (const src of sources) {
    try {
      const r = await src(videoId)
      if (r && r.viewCount > 0) { winner = r; winnerSrc = src; break }
    } catch {
      // Bandome kitą source
    }
  }
  if (!winner) return null

  // Datos backfill: jei viewCount gavom iš mažiau patikimo source'o (pvz.
  // search_text neturi uploadDate, o Vercel'yje watch/player dažnai blokuoti),
  // datą pabandom ištraukti iš metadata-rich source'ų atskirai. Be šito
  // release_year/month/day likdavo tušti, nors video data egzistuoja.
  if (!winner.uploadedAt) {
    for (const src of [tryYtDataApi, tryWatchPage, tryPlayerApi]) {
      if (src === winnerSrc) continue
      try {
        const r = await src(videoId)
        if (r?.uploadedAt) { winner.uploadedAt = r.uploadedAt; break }
      } catch {
        // Bandome kitą source
      }
    }
  }
  return winner
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
