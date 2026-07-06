import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'video'
  const pageToken = searchParams.get('pageToken') || ''

  if (!q.trim()) return NextResponse.json({ results: [] })

  // YouTube Data API kvotos apsauga (search.list = 100 vienetų/užklausa): 20/min/IP.
  if (!(await rateLimit(`yt:${clientIp(req)}`, 20, 60))) {
    return NextResponse.json({ results: [], error: 'Per daug užklausų' }, { status: 429 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ results: [], error: 'YOUTUBE_API_KEY not configured' })

  // ── Kanalo paieška ────────────────────────────────────────────────────────
  if (type === 'channel') {
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=8&key=${apiKey}`
      )
      const searchData = await searchRes.json()
      if (searchData.error) throw new Error(searchData.error.message)

      const items = searchData.items || []
      if (!items.length) return NextResponse.json({ results: [] })

      const channelIds = items.map((i: any) => i.id.channelId).join(',')
      const detailRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?` +
        `part=snippet,brandingSettings,topicDetails&id=${channelIds}&key=${apiKey}`
      )
      const detailData = await detailRes.json()
      const detailMap: Record<string, any> = {}
      for (const ch of detailData.items || []) detailMap[ch.id] = ch

      const YT_COUNTRY: Record<string, string> = {
        LT:'Lietuva', LV:'Latvija', EE:'Estija', US:'JAV', GB:'Didžioji Britanija',
        DE:'Vokietija', FR:'Prancūzija', SE:'Švedija', NO:'Norvegija', FI:'Suomija',
        DK:'Danija', CA:'Kanada', AU:'Australija', RU:'Rusija', IT:'Italija',
        ES:'Ispanija', NL:'Olandija', BE:'Belgija', PL:'Lenkija', IE:'Airija',
        JP:'Japonija', KR:'Pietų Korėja', BR:'Brazilija', MX:'Meksika', PT:'Portugalija',
      }

      const results = items.map((item: any) => {
        const detail = detailMap[item.id.channelId] || {}
        const snippet = detail.snippet || item.snippet
        const branding = detail.brandingSettings?.channel || {}
        const topics: string[] = detail.topicDetails?.topicCategories || []
        const countryCode = snippet.country || branding.country || ''
        const thumbnail =
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url ||
          snippet.thumbnails?.default?.url || ''
        const genres = topics
          .map((t: string) => decodeURIComponent(t.split('/').pop() || '').replace(/_/g, ' '))
          .filter(Boolean)
        const rawDescription: string = snippet.description || ''
        return {
          channelId: item.id.channelId,
          name: snippet.title,
          description: rawDescription.slice(0, 300),
          rawDescription,
          thumbnail,
          url: `https://www.youtube.com/channel/${item.id.channelId}`,
          customUrl: snippet.customUrl ? `https://www.youtube.com/${snippet.customUrl}` : '',
          country: YT_COUNTRY[countryCode] || '',
          genres,
        }
      })
      return NextResponse.json({ results })
    } catch (e: any) {
      return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
    }
  }

  // ── Video paieška ─────────────────────────────────────────────────────────
  try {
    // 1. Ieškoti video. NEAPRIBOTI categoryId=10 — daugelis muzikos video
    // YT'e nepriskirti Music kategorijai. Plus pageToken support — picker'is
    // gali užsiprašyti next page'o.
    const ptParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=10` +
      `&key=${apiKey}${ptParam}`
    )
    const searchData = await searchRes.json()

    if (searchData.error) {
      const errMsg = searchData.error.message || 'YouTube API error'
      const errCode = searchData.error.code || 0
      if (errCode === 403 || errMsg.includes('quota')) {
        return NextResponse.json({ results: [], error: `Kvota išnaudota: ${errMsg}` })
      }
      return NextResponse.json({ results: [], error: errMsg })
    }

    const items = searchData.items || []
    if (!items.length) return NextResponse.json({ results: [] })

    // 2. Patikrinti video statusą + paimti statistics (viewCount) — vienas call
    const videoIds = items.map((i: any) => i.id.videoId).join(',')
    let statusMap: Record<string, any> = {}
    let detailFailed = false
    try {
      const detailRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?` +
        `part=status,contentDetails,statistics&id=${videoIds}&key=${apiKey}`
      )
      const detailData = await detailRes.json()
      if (detailData.error) {
        console.error('[yt-search] videos detail error:', detailData.error.code, detailData.error.message)
        detailFailed = true
      } else {
        for (const v of detailData.items || []) statusMap[v.id] = v
      }
    } catch (e: any) {
      console.error('[yt-search] videos detail fetch failed:', e.message)
      detailFailed = true
    }

    // 3. Filtruoti ir ranguoti — pirmenybė oficialiam kanalui
    // Jei detail call nepavyko, naudojam visus rezultatus be filtravimo
    const validItems = detailFailed ? items : items.filter((item: any) => {
      const vid = item.id.videoId
      const detail = statusMap[vid]
      if (!detail) return false
      const status = detail.status
      if (!status) return false
      if (status.privacyStatus === 'private') return false
      if (!status.embeddable) return false
      return true
    })

    // Ranguoti: Official/VEVO kanalai pirmiau, Topic kanalai paskiausiai
    const ranked = [...validItems].sort((a: any, b: any) => {
      const aChannel = a.snippet.channelTitle || ''
      const bChannel = b.snippet.channelTitle || ''
      const isTopicA = aChannel.endsWith('- Topic') || aChannel.endsWith('Topic')
      const isTopicB = bChannel.endsWith('- Topic') || bChannel.endsWith('Topic')
      const isOfficialA = /official|vevo/i.test(aChannel)
      const isOfficialB = /official|vevo/i.test(bChannel)
      if (isOfficialA && !isOfficialB) return -1
      if (!isOfficialA && isOfficialB) return 1
      if (!isTopicA && isTopicB) return -1
      if (isTopicA && !isTopicB) return 1
      return 0
    })

    // 4. oEmbed tikrinimas — ar video tikrai pasiekiamas (regioniniai blokai)
    // Lygiagrečiai tikriname pirmus 5 kandidatus
    const candidates = ranked.slice(0, 8)
    const oembedResults = await Promise.all(
      candidates.map(async (item: any) => {
        try {
          const r = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${item.id.videoId}&format=json`,
            { signal: AbortSignal.timeout(3000) }
          )
          return r.ok ? item : null
        } catch {
          return null
        }
      })
    )
    const reachable = oembedResults.filter(Boolean)
    // Jei oEmbed patikrinimas nepavyko visiems — grąžinti nepatikrintus (fallback)
    const finalItems = reachable.length > 0 ? reachable : ranked

    const results = finalItems.slice(0, 5).map((item: any) => {
      const vid = item.id.videoId
      const detail = statusMap[vid] || {}
      const stats = detail.statistics || {}
      const viewCount = stats.viewCount ? parseInt(stats.viewCount, 10) : null
      return {
        videoId: vid,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.default?.url || '',
        publishedAt: item.snippet.publishedAt,
        viewCount,
      }
    })

    return NextResponse.json({
      results,
      nextPageToken: searchData.nextPageToken || null,
      ...(detailFailed && { warning: 'YouTube video details unavailable — results unfiltered' }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
