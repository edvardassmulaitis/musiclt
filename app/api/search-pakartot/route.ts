import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://pakartot.lt/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; musiclt/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'lt,en;q=0.9',
        },
        next: { revalidate: 60 },
      }
    )

    if (!res.ok) return NextResponse.json([])

    const html = await res.text()

    // Pakartot.lt grąžina atlikėjus - parse'iname jų kortelių struktūrą
    // Tipiška struktūra: <a href="/atlikejas/..."> arba <a href="/daina/...">
    const results: { name: string; url: string; type: 'artist' | 'song'; avatar?: string }[] = []

    // Artistai
    const artistRegex = /href="(\/atlikejas\/[^"]+)"[^>]*>[\s\S]*?<[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([\s\S]*?)<\//gi
    let m
    while ((m = artistRegex.exec(html)) !== null) {
      const url = 'https://pakartot.lt' + m[1]
      const name = m[2].replace(/<[^>]+>/g, '').trim()
      if (name && !results.find(r => r.url === url)) {
        results.push({ name, url, type: 'artist' })
      }
    }

    // Jei regex nerado - bandome kitą pattern (paprastesnis)
    if (results.length === 0) {
      const linkRegex = /href="(\/atlikejas\/([^"/?]+))"/gi
      const seen = new Set<string>()
      while ((m = linkRegex.exec(html)) !== null) {
        const slug = m[2]
        const url = 'https://pakartot.lt' + m[1]
        if (!seen.has(slug)) {
          seen.add(slug)
          const name = decodeURIComponent(slug.replace(/-/g, ' '))
            .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          results.push({ name, url, type: 'artist' })
        }
      }
    }

    return NextResponse.json(results.slice(0, 8))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
