import { NextRequest, NextResponse } from 'next/server'

// YouTube šalies kodas → lietuviškas pavadinimas
const YT_COUNTRY: Record<string, string> = {
  LT:'Lietuva', LV:'Latvija', EE:'Estija', US:'JAV', GB:'Didžioji Britanija',
  DE:'Vokietija', FR:'Prancūzija', SE:'Švedija', NO:'Norvegija', FI:'Suomija',
  DK:'Danija', CA:'Kanada', AU:'Australija', RU:'Rusija', IT:'Italija',
  ES:'Ispanija', NL:'Olandija', BE:'Belgija', PL:'Lenkija', IE:'Airija',
  JP:'Japonija', KR:'Pietų Korėja', BR:'Brazilija', MX:'Meksika', PT:'Portugalija',
}


function extractSocial(description: string, branding: any, platform: string): string {
  // Iš branding links
  const links: any[] = branding.featuredChannelsUrls || []
  // Iš aprašymo teksto – ieškoti URL
  const patterns: Record<string, RegExp> = {
    facebook: /https?:\/\/(www\.)?facebook\.com\/[^\s
"')]+/i,
    instagram: /https?:\/\/(www\.)?instagram\.com\/[^\s
"')]+/i,
    twitter: /https?:\/\/(www\.)?(?:twitter|x)\.com\/[^\s
"')]+/i,
    spotify: /https?:\/\/open\.spotify\.com\/artist\/[^\s
"')]+/i,
  }
  const pat = patterns[platform]
  if (pat) {
    const m = description.match(pat)
    if (m) return m[0].replace(/[.,;]+$/, '')
  }
  return ''
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get('q') || ''
  if (!q.trim()) return NextResponse.json({ results: [] })
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ results: [], error: 'YOUTUBE_API_KEY not configured' })

  try {
    // 1. Rasti kanalus
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=5&key=${apiKey}`
    )
    const searchData = await searchRes.json()
    if (searchData.error) throw new Error(searchData.error.message)

    const items = searchData.items || []
    if (!items.length) return NextResponse.json({ results: [] })

    const channelIds = items.map((i: any) => i.id.channelId).join(',')

    // 2. Pilni kanalo duomenys
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?` +
      `part=snippet,brandingSettings,topicDetails&id=${channelIds}&key=${apiKey}`
    )
    const detailData = await detailRes.json()
    const detailMap: Record<string, any> = {}
    for (const ch of detailData.items || []) detailMap[ch.id] = ch

    const results = items.map((item: any) => {
      const detail = detailMap[item.id.channelId] || {}
      const snippet = detail.snippet || item.snippet
      const branding = detail.brandingSettings?.channel || {}
      const topics: string[] = detail.topicDetails?.topicCategories || []

      const countryCode = snippet.country || branding.country || ''
      const country = YT_COUNTRY[countryCode] || ''

      const thumbnail =
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url || ''

      // Žanras iš Wikipedia topic URL
      const genres = topics
        .map((t: string) => decodeURIComponent(t.split('/').pop() || '').replace(/_/g, ' '))
        .filter(Boolean)

      // Socialiniai tinklai iš brandingSettings
      const rawDescription: string = snippet.description || ''
      const facebook = extractSocial(rawDescription, branding, 'facebook')
      const instagram = extractSocial(rawDescription, branding, 'instagram')
      const twitter = extractSocial(rawDescription, branding, 'twitter')
      const spotify = extractSocial(rawDescription, branding, 'spotify')

      return {
        channelId: item.id.channelId,
        name: snippet.title,
        description: rawDescription.slice(0, 300),
        rawDescription,
        thumbnail,
        url: `https://www.youtube.com/channel/${item.id.channelId}`,
        customUrl: snippet.customUrl ? `https://www.youtube.com/${snippet.customUrl}` : '',
        country,
        genres,
        facebook,
        instagram,
        twitter,
        spotify,
      }
    })

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
