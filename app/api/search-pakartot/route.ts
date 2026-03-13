import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  try {
    // Strategija 1: Google Custom Search API jei turime key
    const googleKey = process.env.GOOGLE_SEARCH_API_KEY
    const googleCx = process.env.GOOGLE_SEARCH_CX

    if (googleKey && googleCx) {
      const res = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}` +
        `&q=${encodeURIComponent(q)}&siteSearch=pakartot.lt&num=8`
      )
      if (res.ok) {
        const data = await res.json()
        const results = (data.items || [])
          .filter((item: any) => item.link?.includes('pakartot.lt/alias/'))
          .map((item: any) => {
            const slug = item.link.match(/\/alias\/([^/?#]+)/)?.[1] || ''
            // Tikras vardas iš title: "Atlikėjas PAULINA PAUKŠTAITYTĖ" → "Paulina Paukštaitytė"
            const rawTitle = item.title?.replace(/^Atlik[eė]jas(\s+ir\s+autorius)?\s+/i, '').trim()
            const name = rawTitle || slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
            return { name, url: item.link }
          })
        if (results.length > 0) return NextResponse.json(results)
      }
    }

    // Strategija 2: Tiesiogiai fetch pakartot.lt search (veikia iš Vercel, ne iš šio sandbox)
    const res = await fetch(
      `https://pakartot.lt/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'lt,en;q=0.9',
          'Referer': 'https://pakartot.lt/',
        },
      }
    )

    if (!res.ok) return NextResponse.json([])
    const html = await res.text()

    const results: { name: string; url: string }[] = []
    const seen = new Set<string>()

    // /alias/ URL paieška
    const aliasRegex = /href="(\/alias\/([a-z0-9\-]+))"/gi
    let m
    while ((m = aliasRegex.exec(html)) !== null) {
      const slug = m[2]
      const url = `https://pakartot.lt/alias/${slug}`
      if (!seen.has(slug)) {
        seen.add(slug)
        const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        results.push({ name, url })
      }
    }

    // Jei nieko - bandome /atlikejas/ (senasis formatas)
    if (results.length === 0) {
      const oldRegex = /href="(\/atlikejas\/([^"/?]+))"/gi
      while ((m = oldRegex.exec(html)) !== null) {
        const slug = m[2]
        const url = `https://pakartot.lt${m[1]}`
        if (!seen.has(slug)) {
          seen.add(slug)
          const name = decodeURIComponent(slug).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          results.push({ name, url })
        }
      }
    }

    return NextResponse.json(results.slice(0, 8))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
