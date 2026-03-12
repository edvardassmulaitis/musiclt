import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { wikiTitle, type } = await req.json()
    if (!wikiTitle) return NextResponse.json({ description: '' })

    // Gauname pilną Wikipedia tekstą (ne tik summary)
    const [sumRes, fullRes] = await Promise.all([
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`),
      fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&explaintext=true&format=json&origin=*`)
    ])

    const sum = sumRes.ok ? await sumRes.json() : {}
    const fullJson = fullRes.ok ? await fullRes.json() : {}
    const pages = fullJson.query?.pages || {}
    const fullExtract: string = (Object.values(pages)[0] as any)?.extract || ''

    const rawText = fullExtract || sum.extract || ''
    if (!rawText) return NextResponse.json({ description: '' })
    // Daugiau medžiagos = geresnis aprašymas
    const sourceText = rawText.substring(0, 6000)

    const isGroup = type === 'group' || type === 'band'
    // Ilgis pagal straipsnio turtingumą
    const textLen = rawText.length
    let lengthInstruction: string
    if (textLen > 15000) {
      lengthInstruction = isGroup ? '5–7 pastraipos (apie 400–600 žodžių)' : '4–6 pastraipos (apie 300–500 žodžių)'
    } else if (textLen > 8000) {
      lengthInstruction = isGroup ? '4–5 pastraipos (apie 280–400 žodžių)' : '3–4 pastraipos (apie 200–320 žodžių)'
    } else if (textLen > 3000) {
      lengthInstruction = isGroup ? '3–4 pastraipos (apie 180–280 žodžių)' : '2–3 pastraipos (apie 120–200 žodžių)'
    } else {
      lengthInstruction = isGroup ? '2–3 pastraipos (apie 120–180 žodžių)' : '1–2 pastraipos (apie 80–130 žodžių)'
    }

    const prompt = `Esi patyręs muzikos žurnalistas, rašantis lietuviškam muzikos portalui Music.lt.

Remdamasis šia informacija apie atlikėją, parašyk REDAKCINĮ APRAŠYMĄ lietuvių kalba:

---
${sourceText}
---

STILIUS ir TURINYS:
- Rašyk kaip muzikos kritikas - ne biografas ar enciklopedistas
- Pagrindinis akcentas: MUZIKA, ĮTAKA, STILIUS, REIKŠMĖ - ne biografija
- Neminėk gimimo datos, tikro vardo, šeimyninių detalių (tai rodoma kitur)
- Minėk svarbiausius albumus, hitus, žanrą, stilistinę evoliuciją, palikimą
- Rašyk trečiuoju asmeniu, natūraliai ir įtraukiančiai

FORMATAS:
- Ilgis: ${lengthInstruction}
- Kiekviena pastraipa atskirta tuščia eilute
- Jokių antraščių, sąrašų ar formatavimo - tik grynas tekstas
- Naudok tik paprastą brūkšnelį "-", NE "–" ar "—"

KALBA:
- Taisyklinga, natūrali lietuvių kalba - NE vertimas
- Tekstas turi skambėti kaip parašytas žmogaus`

    console.log('[generate-description] wikiTitle:', wikiTitle, 'type:', type, 'sourceText length:', sourceText.length, 'apiKey set:', !!process.env.ANTHROPIC_API_KEY)
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
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
    const raw = data.content?.[0]?.text?.trim() || ''
    // Paverčiame pastraipas į HTML <p> tagus (redaktorius naudoja HTML)
    const description = raw
      ? '<p>' + raw.split(/\n\n+/).map((p: string) => p.replace(/\n/g, ' ').trim()).filter(Boolean).join('</p><p>') + '</p>'
      : ''
    console.log('[generate-description] description length:', description.length)
    return NextResponse.json({ description })
  } catch (e: any) {
    console.error('[generate-description]', e.message)
    return NextResponse.json({ description: '' })
  }
}
