// lib/social/youtube.ts
//
// YouTube auto-feed adapteris. Viešas — tik API raktas (YOUTUBE_API_KEY),
// jokio atlikėjo OAuth. Traukia naujausius kanalo įkėlimus.

const API = 'https://www.googleapis.com/youtube/v3'

export type NormalizedItem = {
  external_id: string
  kind: string
  url: string
  media_url: string | null
  thumb_url: string | null
  caption: string | null
  published_at: string | null
  raw: any
}

function key(): string {
  // Dedikuotas studijos raktas (kad nekonkuruotų su scrape/koncertų YT kvota),
  // su atsarga į bendrą YOUTUBE_API_KEY.
  const k = process.env.YOUTUBE_API_KEY_STUDIO || process.env.YOUTUBE_API_KEY
  if (!k) throw new Error('YOUTUBE_API_KEY nesukonfigūruotas')
  return k
}

// „uploads" playlisto ID išvedamas iš kanalo ID be API užklausos:
// UC... → UU... (Google konvencija). Taupo kvotą (sync = 1 vnt.).
function uploadsPlaylistId(channelId: string): string | null {
  return /^UC[\w-]{20,}$/.test(channelId) ? 'UU' + channelId.slice(2) : null
}

// fetch + klaidos iškėlimas (kitaip API 403/quota grįžta kaip JSON be throw,
// ir feed'as tyliai lieka tuščias).
async function ytGet(url: string): Promise<any> {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    const m = data?.error?.message || `${res.status} ${res.statusText}`
    throw new Error(`YouTube API: ${m}`)
  }
  return data
}

/** Iš kanalo URL / handle / ID išgauna kanalo ID (UC...). */
export async function resolveChannelId(input: string): Promise<string | null> {
  const s = (input || '').trim()
  if (!s) return null
  // Tiesioginis UC... ID
  if (/^UC[\w-]{20,}$/.test(s)) return s
  // /channel/UC...
  const chan = s.match(/channel\/(UC[\w-]{20,})/)
  if (chan) return chan[1]
  // @handle (URL arba bare)
  let handle: string | null = null
  const hUrl = s.match(/youtube\.com\/@([\w.\-]+)/)
  if (hUrl) handle = hUrl[1]
  else if (/^@[\w.\-]+$/.test(s)) handle = s.slice(1)
  if (handle) {
    const d = await ytGet(`${API}/channels?part=id&forHandle=@${encodeURIComponent(handle)}&key=${key()}`)
    if (d?.items?.[0]?.id) return d.items[0].id
  }
  // /user/NAME (legacy)
  const user = s.match(/youtube\.com\/user\/([\w.\-]+)/)
  if (user) {
    const d = await ytGet(`${API}/channels?part=id&forUsername=${encodeURIComponent(user[1])}&key=${key()}`)
    if (d?.items?.[0]?.id) return d.items[0].id
  }
  // Paskutinė išeitis — paieška pagal /c/NAME ar tekstą (brangu: 100 vnt.)
  const cName = s.match(/youtube\.com\/c\/([\w.\-]+)/)
  const q = cName ? cName[1] : (/^https?:/.test(s) ? null : s)
  if (q) {
    const d = await ytGet(`${API}/search?part=id&type=channel&maxResults=1&q=${encodeURIComponent(q)}&key=${key()}`)
    if (d?.items?.[0]?.id?.channelId) return d.items[0].id.channelId
  }
  return null
}

/** Kanalo „uploads" playlisto ID + kanalo pavadinimas. */
export async function getChannelInfo(channelId: string): Promise<{ uploads: string | null; title: string | null }> {
  const d = await ytGet(`${API}/channels?part=contentDetails,snippet&id=${encodeURIComponent(channelId)}&key=${key()}`)
  const item = d?.items?.[0]
  return {
    uploads: item?.contentDetails?.relatedPlaylists?.uploads || null,
    title: item?.snippet?.title || null,
  }
}

/** Vieno video metaduomenys (pavadinimas, įkėlimo data, peržiūros). */
export async function fetchVideoMeta(videoId: string): Promise<{ title: string; publishedAt: string | null; views: number; thumb: string | null } | null> {
  const d = await ytGet(`${API}/videos?part=snippet,statistics&id=${encodeURIComponent(videoId)}&key=${key()}`)
  const it = d?.items?.[0]
  if (!it) return null
  const th = it?.snippet?.thumbnails || {}
  return {
    title: it?.snippet?.title || '',
    publishedAt: it?.snippet?.publishedAt || null,
    views: Number(it?.statistics?.viewCount || 0),
    thumb: th.maxres?.url || th.high?.url || th.medium?.url || th.default?.url || null,
  }
}

/** Naujausi kanalo įkėlimai → normalizuoti įrašai. */
export async function fetchYouTubeUploads(channelId: string, max = 12): Promise<NormalizedItem[]> {
  // Be papildomos channels.list užklausos — playlist ID išvedam iš kanalo ID.
  const uploads = uploadsPlaylistId(channelId) || (await getChannelInfo(channelId)).uploads
  if (!uploads) return []
  const d = await ytGet(`${API}/playlistItems?part=snippet,contentDetails&maxResults=${Math.min(max, 50)}&playlistId=${encodeURIComponent(uploads)}&key=${key()}`)
  const items: NormalizedItem[] = []
  for (const it of (d?.items || [])) {
    const vid = it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId
    if (!vid) continue
    const th = it?.snippet?.thumbnails || {}
    const thumb = th.maxres?.url || th.high?.url || th.medium?.url || th.default?.url || null
    items.push({
      external_id: vid,
      kind: 'video',
      url: `https://www.youtube.com/watch?v=${vid}`,
      media_url: thumb,
      thumb_url: thumb,
      caption: it?.snippet?.title || null,
      published_at: it?.contentDetails?.videoPublishedAt || it?.snippet?.publishedAt || null,
      raw: { title: it?.snippet?.title, description: (it?.snippet?.description || '').slice(0, 500) },
    })
  }
  return items
}
