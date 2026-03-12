import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { wikiTitle, type } = await req.json()
    if (!wikiTitle) return NextResponse.json({ description: '' })

    // Gauname pilną Wikipedia tekstą (ne tik summary)
    const [sumRes, fullRes] = await Promise.all([
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`),
      fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`)
    ])

    const sum = sumRes.ok ? await sumRes.json() : {}
    const fullJson = fullRes.ok ? await fullRes.json() : {}
    const pages = fullJson.query?.pages || {}
    const fullExtract: string = (Object.values(pages)[0] as any)?.extract || ''

    // Naudojame pilną intro tekstą (iki 3000 simbolių)
    const sourceText = (fullExtract || sum.extract || '').substring(0, 3000)
    if (!sourceText) return NextResponse.json({ description: '' })

    const isGroup = type === 'group' || type === 'band'
    const lengthInstruction = isGroup
      ? '2–4 pastraipos (apie 150–300 žodžių)'
      : '1–2 pastraipos (apie 80–150 žodžių)'

    const prompt = `Esi muzikos žurnalistas rašantis lietuviškam muzikos portalui Music.lt.

Remiantis šiuo Wikipedia tekstu anglų kalba, parašyk aprašymą LIETUVIŲ KALBA:

---
${sourceText}
---

Reikalavimai:
- Kalba: lietuvių, natūrali ir sklandžia žurnalistine kalba, NE mašininis vertimas
- Ilgis: ${lengthInstruction}
- Stilius: informatyvus, enciklopedinis, tinkamas muzikos portalui
- Minėk: kilmę, žanrą, svarbius albumus ar kūrinius, reikšmę muzikos pasaulyje
- Nenaudok žodžio "Wikipedia"
- Nerašyk jokių antraščių, tik grynas tekstas pastraipomis
- Jei grupė — minėk narius tik trumpai (jei svarbu kontekstui)
- Rašyk trečiuoju asmeniu`

    console.log('[generate-description] wikiTitle:', wikiTitle, 'type:', type, 'sourceText length:', sourceText.length, 'apiKey set:', !!process.env.ANTHROPIC_API_KEY)
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!apiRes.ok) {
      const errBody = await apiRes.text()
      console.error('[generate-description] Anthropic error:', apiRes.status, errBody)
      return NextResponse.json({ description: '' })
    }

    const data = await apiRes.json()
    console.log('[generate-description] response type:', data.type, 'stop:', data.stop_reason, 'content blocks:', data.content?.length)
    const description = data.content?.[0]?.text?.trim() || ''
    console.log('[generate-description] description length:', description.length)
    return NextResponse.json({ description })
  } catch (e: any) {
    console.error('[generate-description]', e.message)
    return NextResponse.json({ description: '' })
  }
}
