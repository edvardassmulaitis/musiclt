import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  try {
    // pakartot.lt yra SPA - tiesioginis fetch neveikia
    // Naudojame DuckDuckGo HTML paieška su site:pakartot.lt
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q + ' site:pakartot.lt/alias')}`
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'lt,en;q=0.9',
      },
    })

    if (!res.ok) return NextResponse.json([])
    const html = await res.text()

    // DuckDuckGo HTML rezultatų struktūra: <a class="result__url" href="...">
    // arba <a class="result__a" href="...">
    const results: { name: string; url: string }[] = []
    const seen = new Set<string>()

    // Ieškome pakartot.lt/alias/ URL iš DDG rezultatų
    const urlRegex = /https?:\/\/(?:www\.)?pakartot\.lt\/alias\/([a-z0-9\-]+)/gi
    let m
    while ((m = urlRegex.exec(html)) !== null) {
      const slug = m[1]
      const url = `https://pakartot.lt/alias/${slug}`
      if (!seen.has(slug)) {
        seen.add(slug)
        // Vardas iš slug: "paulina-paukstaityte" → "Paulina Paukstaityte"
        const name = slug.replace(/-/g, ' ')
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
        results.push({ name, url })
      }
    }

    // Bandome išgauti tikrus vardus iš DDG result titles
    // <a class="result__a" ...>Atlikėjas PAULINA PAUKŠTAITYTĖ</a>
    const titleRegex = /class="result__a"[^>]*>Atlik[eė]jas(?:\s+ir\s+autorius)?\s+([^<]+)<\/a>/gi
    const titleResults: { name: string; url: string }[] = []
    while ((m = titleRegex.exec(html)) !== null) {
      const rawName = m[1].trim()
      // Tikrinama ar turime URL šiam vardui
      const nameLower = rawName.toLowerCase()
      const matchedSlug = [...seen].find(s => {
        const slugName = s.replace(/-/g, ' ')
        return nameLower.includes(slugName.slice(0, 6))
      })
      if (matchedSlug) {
        titleResults.push({ name: rawName, url: `https://pakartot.lt/alias/${matchedSlug}` })
      }
    }

    // Jei radome tikrus vardus - naudojame juos
    const finalResults = titleResults.length > 0
      ? titleResults
      : results

    return NextResponse.json(finalResults.slice(0, 6))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
