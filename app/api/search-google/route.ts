import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ results: [] })

  const apiKey = process.env.GOOGLE_KG_API_KEY
  if (!apiKey) return NextResponse.json({ results: [], error: 'GOOGLE_KG_API_KEY not set' })

  try {
    const res = await fetch(
      `https://kgsearch.googleapis.com/v1/entities:search?` +
      `query=${encodeURIComponent(q)}&key=${apiKey}&limit=8&indent=true` +
      `&types=MusicGroup&types=Person`
    )
    if (!res.ok) return NextResponse.json({ results: [] })
    const data = await res.json()

    const results = (data.itemListElement || [])
      .map((el: any) => {
        const entity = el.result
        const score = el.resultScore || 0
        const name: string = entity.name || ''
        const description: string = entity.description || ''
        const detail: string = entity.detailedDescription?.articleBody || ''
        const image: string = entity.image?.contentUrl || entity.image?.url || ''
        const wikiUrl: string = entity.detailedDescription?.url || ''
        const types: string[] = entity['@type'] || []

        return { name, description, detail, image, wikiUrl, types, score }
      })
      .filter((r: any) => r.name)
      .sort((a: any, b: any) => b.score - a.score)

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 })
  }
}
