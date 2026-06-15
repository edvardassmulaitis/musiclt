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
  const k = process.env.YOUTUBE_API_KEY
  if (!k) throw new Error('YOUTUBE_API_KEY nesukonfigūruotas')
  return k
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
    const r = await fetch(`${API}/channels?part=id&forHandle=@${encodeURIComponent(handle)}&key=${key()}`)
    const d = await r.json()
    if (d?.items?.[0]?.id) return d.items[0].id
  }
  // /user/NAME (legacy)
  const user = s.match(/youtube\.com\/user\/([\w.\-]+)/)
  if (user) {
    const r = await fetch(`${API}/channels?part=id&forUsername=${encodeURIComponent(user[1])}&key=${key()}`)
    const d = await r.json()
    if (d?.items?.[0]?.id) return d.items[0].id
  }
  // Paskutinė išeitis — paieška pagal /c/NAME ar tekstą (brangu: 100 vnt.)
  const cName = s.match(/youtube\.com\/c\/([\w.\-]+)/)
  const q = cName ? cName[1] : (/^https?:/.test(s) ? null : s)
  if (q) {
    const r = await fetch(`${API}/search?part=id&type=channel&maxResults=1&q=${encodeURIComponent(q)}&key=${key()}`)
    const d = await r.json()
    if (d?.items?.[0]?.id?.channelId) return d.items[0].id.channelId
  }
  return null
}

/** Kanalo „uploads" playlisto ID + kanalo pavadinimas. */
export async function getChannelInfo(channelId: string): Promise<{ uploads: string | null; title: string | null }> {
  const r = await fetch(`${API}/channels?part=contentDetails,snippet&id=${encodeURIComponent(channelId)}&key=${key()}`)
  const d = await r.json()
  const item = d?.items?.[0]
  return {
    uploads: item?.contentDetails?.relatedPlaylists?.uploads || null,
    title: item?.snippet?.title || null,
  }
}

/** Naujausi kanalo įkėlimai → normalizuoti įrašai. */
export async function fetchYouTubeUploads(channelId: string, max = 12): Promise<NormalizedItem[]> {
  const { uploads } = await getChannelInfo(channelId)
  if (!uploads) return []
  const r = await fetch(`${API}/playlistItems?part=snippet,contentDetails&maxResults=${Math.min(max, 50)}&playlistId=${encodeURIComponent(uploads)}&key=${key()}`)
  const d = await r.json()
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
