// AI-powered era generator from a Wikipedia article.
//
// POST /api/admin/artists/[id]/eras/generate
//   body: { wikiUrl?: string, wikiTitle?: string }
//
// Pipeline:
//   1. Resolve wiki title from URL/title.
//   2. Fetch the EN Wikipedia full extract (plain-text).
//   3. Send to Claude with a structured-output prompt — get JSON eras
//      array (title LT, subtitle?, year_start, year_end?, description LT).
//   4. Return rows for admin UI to preview + save. Save'as nedaromas
//      automatiškai — useris turi paspausti „Išsaugoti" po preview.
//
// Returns: { rows: Era[], rawJson?: string, error?: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Era = {
  sort_order: number
  title: string
  subtitle: string | null
  year_start: number
  year_end: number | null
  description: string | null
  source: string
}

function parseWikiTitle(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Accept full URL: https://en.wikipedia.org/wiki/Coldplay → "Coldplay"
  const m = trimmed.match(/\/wiki\/([^#?]+)/)
  if (m) return decodeURIComponent(m[1])
  // Accept bare title
  return trimmed
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const { id: _id } = await params
  const body = await req.json().catch(() => ({}))
  const rawInput: string = body.wikiUrl || body.wikiTitle || ''
  const wikiTitle = parseWikiTitle(rawInput)
  if (!wikiTitle) return NextResponse.json({ error: 'Pateik Wikipedia URL arba pavadinimą' }, { status: 400 })

  // Fetch full Wikipedia extract.
  const fullRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&explaintext=true&format=json&origin=*`,
  )
  if (!fullRes.ok) {
    return NextResponse.json({ error: `Wiki fetch failed: ${fullRes.status}` }, { status: 502 })
  }
  const wikiJson = await fullRes.json()
  const pages = wikiJson.query?.pages || {}
  const extract: string = (Object.values(pages)[0] as any)?.extract || ''
  if (!extract || extract.length < 500) {
    return NextResponse.json({ error: 'Wiki straipsnis per trumpas arba neegzistuoja' }, { status: 404 })
  }

  // Trim to a reasonable size so we don't send 50k tokens for big artists.
  // Career sections are usually in the first 8-12k chars after the lead.
  const sourceText = extract.substring(0, 14000)

  const prompt = `Esi muzikos enciklopedijos redaktorius lietuviškam portalui music.lt. Tau pateikiamas EN Wikipedia atlikėjo straipsnio tekstas. Tavo užduotis — išgauti atlikėjo karjeros LAIKOTARPIUS („eras") ir grąžinti juos kaip JSON masyvą.

ATLIKĖJO WIKI STRAIPSNIS:
'''
${sourceText}
'''

REIKALAVIMAI:
1) Išgauk 3–6 reikšmingus karjeros laikotarpius. Tipiškai wiki "History" arba "Career" sekcija turi sub-headerius su metų intervalais ir albumų pavadinimais — naudok tai kaip pagrindą.
2) Kiekvienam laikotarpiui pateik:
   - title: TRUMPAS lietuviškas pavadinimas (1–3 žodžiai), pvz. Pradžia, Klasika, Stadium pop, Eksperimentai, Solo karjera, Comeback. NE direct'inis vertimas, o žmogiškas, įsimenamas. NEDĖK kabučių apie title.
   - subtitle: visada null.
   - year_start: pradžios metai (skaičius).
   - year_end: pabaigos metai (skaičius), arba null jei laikotarpis tęsiasi iki šių dienų.
   - description: 1–2 sakiniai lietuvių kalba. SVARBU: albumų pavadinimus rašyk LIETUVIŠKOMIS kabutėmis „TITLE" (Unicode U+201E ir U+201C), NIEKADA su ASCII " (U+0022) — kitaip JSON parser sulauš. Geras pavyzdys: „Yellow", „The Scientist". Blogas: "Yellow".
3) Sortuok JSON masyvą NUO NAUJAUSIO LAIKOTARPIO Į SENIAUSIĄ (newest first).
4) Pirmas elementas turi sort_order=0, antras=1 ir t.t.
5) NESUTAPYK metų intervalų — kiekvienas albumas turi tilpti į vieną erą.
6) Jei wiki neturi aiškios laikotarpių struktūros — sukurk pagrįstas pagal albumų išleidimo metus, bet vis tiek duok prasmingus title.

KRITIŠKAI SVARBU JSON FORMATAS:
- ATSAKYMAS — TIK JSON masyvas. Jokio papildomo teksto. Jokio markdown code fence.
- VISI string'ai naudoja " (ASCII double quote) JSON syntax'ui.
- VIDUJE string'ų (description), NIEKADA nenaudok " — naudok LT „" arba aplenk kitaip.
- Title NETURI kabučių (pvz., "Pradžia", ne „"Pradžia"").

Pavyzdys formato:

[
  {"sort_order": 0, "title": "Eksperimentai", "subtitle": null, "year_start": 2019, "year_end": null, "description": "Žanro pasikeitimas su „Everyday Life" ir „Music of the Spheres" — kino-stilistikos albumai, daug pasaulio kolaboracijų."},
  {"sort_order": 1, "title": "Stadium pop", "subtitle": null, "year_start": 2008, "year_end": 2018, "description": "Coldplay tampa vieni didžiausių pasaulio stadium grupių — „Viva la Vida", „Mylo Xyloto" ir „A Head Full of Dreams"."}
]`

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!apiRes.ok) {
    const errBody = await apiRes.text().catch(() => '')
    return NextResponse.json({ error: `Claude API: ${apiRes.status} ${errBody.slice(0, 200)}` }, { status: 502 })
  }
  const apiData = await apiRes.json()
  const rawText: string = apiData.content?.[0]?.text?.trim() || ''
  if (!rawText) return NextResponse.json({ error: 'Empty AI response' }, { status: 502 })

  // Parse JSON — strip code fences if Claude added them despite our prompt.
  let jsonStr = rawText
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  /** Tries JSON.parse, and on failure tries to repair common Claude
   *  mistakes (unescaped " inside string values, trailing commas). */
  function safeParse(s: string): any {
    try { return JSON.parse(s) } catch (_) { /* fall through */ }
    // Attempt 1: replace ASCII " inside string values with LT „" — naive
    // heuristic that walks the JSON char-by-char and tracks state. Only
    // fixes the common case: { "description": "She said "hi" to me." }
    // → { "description": "She said „hi" to me." }
    const repaired: string[] = []
    let inString = false
    let escaped = false
    let keyMode = false
    // We can't reliably distinguish key from value chars without a parser,
    // so we approximate: " is a STRING DELIMITER only if it's preceded by
    // {, ,, : (with optional whitespace) OR followed by , } : ] (after
    // optional whitespace). Otherwise treat it as content and rewrite.
    void keyMode
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (escaped) {
        repaired.push(c)
        escaped = false
        continue
      }
      if (c === '\\') {
        repaired.push(c)
        escaped = true
        continue
      }
      if (c === '"') {
        if (!inString) {
          inString = true
          repaired.push(c)
        } else {
          // Look ahead: is next non-WS one of [,}\]:]?
          let j = i + 1
          while (j < s.length && /\s/.test(s[j])) j++
          const next = s[j]
          if (next === ',' || next === '}' || next === ']' || next === ':' || next === undefined) {
            inString = false
            repaired.push(c)
          } else {
            // Inner quote — rewrite to LT closing quote
            repaired.push('“')
          }
        }
        continue
      }
      repaired.push(c)
    }
    let fixed = repaired.join('')
    // Strip trailing commas before } or ]
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1')
    try { return JSON.parse(fixed) } catch (e) { throw e }
  }

  let rows: Era[] = []
  try {
    const parsed = safeParse(jsonStr)
    if (!Array.isArray(parsed)) throw new Error('Not an array')
    rows = parsed.map((r: any, idx: number) => ({
      sort_order: typeof r.sort_order === 'number' ? r.sort_order : idx,
      title: String(r.title || '').trim(),
      subtitle: r.subtitle ? String(r.subtitle).trim() : null,
      year_start: parseInt(String(r.year_start)) || new Date().getFullYear(),
      year_end: r.year_end ? parseInt(String(r.year_end)) : null,
      description: r.description ? String(r.description).trim() : null,
      source: 'ai_wikipedia',
    }))
  } catch (e: any) {
    return NextResponse.json({
      error: `AI grąžino netaisyklingą JSON: ${e.message}`,
      rawJson: rawText.slice(0, 1500),
    }, { status: 502 })
  }

  return NextResponse.json({ rows, wikiTitle, sourceLength: extract.length })
}
