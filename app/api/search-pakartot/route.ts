import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json([])

  const googleKey = process.env.GOOGLE_SEARCH_API_KEY
  const googleCx = process.env.GOOGLE_SEARCH_CX

  if (!googleKey || !googleCx) {
    return NextResponse.json({ error: 'Nenustatyti GOOGLE_SEARCH_API_KEY ir GOOGLE_SEARCH_CX. Žr. setup instrukciją.' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}` +
      `&q=${encodeURIComponent(q)}&num=10`
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: `Google API klaida: ${res.status} – ${err?.error?.message || res.statusText}` }, { status: 500 })
    }

    const data = await res.json()

    const results = (data.items || [])
      .filter((item: any) => {
        const link: string = item.link || ''
        return link.includes('pakartot.lt/alias/') || link.includes('pakartot.lt/project/')
      })
      .map((item: any) => {
        const link: string = item.link || ''
        const isProject = link.includes('/project/')
        const slug =
          link.match(/\/alias\/([^/?#]+)/)?.[1] ||
          link.match(/\/project\/([^/?#]+)/)?.[1] || ''

        // "Atlikėjas PAULINA PAUKŠTAITYTĖ" → "Paulina Paukštaitytė"
        // "Grupė G&G SINDIKATAS" → "G&G Sindikatas"
        let name = (item.title || '')
          .replace(/^(Atlik[eė]jas(\s+ir\s+autorius)?|Grup[eė])\s+/i, '')
          .replace(/\s*[-–|].*$/, '')
          .trim()
        if (name.length < 2) {
          name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        }

        const snippet = (item.snippet || '').replace(/\n/g, ' ').trim()
        return { name, url: link, type: isProject ? 'group' : 'person', snippet }
      })
      .filter((item: any, idx: number, arr: any[]) =>
        arr.findIndex((x: any) => x.url === item.url) === idx
      )
      .slice(0, 8)

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
