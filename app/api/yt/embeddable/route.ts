/**
 * GET /api/yt/embeddable?videoId={id}
 *
 * Patikrina, ar YouTube video leidžia embed'inti trečioms šalims.
 * Daug muzikos label'ų (pvz SelMusic) yra išjungę embedding'ą — jų
 * iframe'ai užkrauna juodą langą su "Klaida 153" / "Video unavailable".
 *
 * Pirminis šaltinis: YT Data API v3 `videos.list?part=status` —
 *   grąžina `items[0].status.embeddable: true|false`. Quota cost: 1.
 *   Reikia YOUTUBE_API_KEY env var.
 *
 * Fallback: jei API key trūksta, grąžinam optimistic `embeddable: true`
 *   ir tegul YT.Player onError'as pagauna 101/150 client-side.
 *
 * Cache: HTTP `Cache-Control: public, max-age=86400` (24h) — embed'o
 * statusas keičiasi retai (tik kai kanalas pakeičia setting'us).
 *
 * Response: { videoId, embeddable: boolean, source: 'api' | 'memcache' | 'optimistic' }
 */
import { NextRequest, NextResponse } from 'next/server'

// In-memory cache (per Vercel function instance) — papildoma prieš HTTP cache
// kad pakartotini request'ai tame pačiame cold start'e taupy quota.
const _memCache = new Map<string, { embeddable: boolean; t: number }>()
const MEM_TTL_MS = 60 * 60_000 // 1 val

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const videoId = (searchParams.get('videoId') || '').trim()

  // Validate — YT video IDs are [A-Za-z0-9_-]{11} (su _ ir -). Konservatyviai
  // priimam 6-32 length range, reject viską kita.
  if (!videoId || !/^[A-Za-z0-9_-]{6,32}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid videoId' }, { status: 400 })
  }

  const now = Date.now()
  const cached = _memCache.get(videoId)
  if (cached && now - cached.t < MEM_TTL_MS) {
    return NextResponse.json(
      { videoId, embeddable: cached.embeddable, source: 'memcache' },
      { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
    )
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    // Fallback'as — be API key client-side onError handler'is yra vienintelis
    // patikimas signal'as. Optimistic true → iframe try'ina užkrauti, onError
    // 101/150 toggle'ina fallback overlay.
    return NextResponse.json(
      { videoId, embeddable: true, source: 'optimistic' },
      { headers: { 'Cache-Control': 'public, max-age=300' } }
    )
  }

  let embeddable = true
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (r.ok) {
      const data = await r.json() as any
      const item = data?.items?.[0]
      if (item?.status) {
        // Data API v3 grąžina:
        //   status.embeddable: true | false   — explicit flag
        //   status.privacyStatus: 'public' | 'unlisted' | 'private'
        //   status.uploadStatus: 'processed' | ...
        // Embed neveiks jei: !embeddable ARBA private
        if (item.status.embeddable === false) {
          embeddable = false
        } else if (item.status.privacyStatus === 'private') {
          embeddable = false
        }
      } else if (data?.items && data.items.length === 0) {
        // Video neegzistuoja arba pašalintas — embed'o neuždegsim.
        embeddable = false
      }
    }
  } catch {
    // Network klaidos — paliekam optimistic true, kitas request'as gal pavyks.
    // Cache neenforce'inam, kad būtų retried per kitą reload'ą.
  }

  _memCache.set(videoId, { embeddable, t: now })

  return NextResponse.json(
    { videoId, embeddable, source: 'api' },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } }
  )
}
