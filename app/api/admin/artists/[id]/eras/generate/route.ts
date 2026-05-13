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
  // Wikipedia API požiūriu user-agent privalo identifikuoti aplikaciją —
  // be jo grįžta 429 Too Many Requests net pirmam request'ui. Per spec
  // https://meta.wikimedia.org/wiki/User-Agent_policy reikia
  // `<app>/<version> (<contact>)`. Vercel server'is nieko siunčia by
  // default. 2026-05-13 fix po 429 fail'o ant Britney Spears.
  const wikiHeaders = {
    'User-Agent': 'MusicLt-EraExtractor/1.0 (https://music.lt; admin@music.lt)',
    'Accept': 'application/json',
  }
  let extract = ''
  const fullRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&explaintext=true&format=json`,
    { headers: wikiHeaders },
  )
  if (fullRes.ok) {
    const wikiJson = await fullRes.json()
    const pages = wikiJson.query?.pages || {}
    extract = (Object.values(pages)[0] as any)?.extract || ''
  }
  // Jei full fail'ino arba per trumpas — fallback į REST summary endpoint.
  if (!extract || extract.length < 500) {
    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`,
      { headers: wikiHeaders },
    )
    if (sumRes.ok) {
      const sum = await sumRes.json()
      const sumExtract: string = sum.extract || ''
      if (sumExtract && sumExtract.length > 200) extract = sumExtract
    }
    if (!extract || extract.length < 200) {
      return NextResponse.json({
        error: `Nepavyko gauti Wiki turinio (status: ${fullRes.status}). Patikrink, ar URL teisingas.`,
      }, { status: 502 })
    }
  }

  // Trim to a reasonable size so we don't send 50k tokens for big artists.
  // Career sections are usually in the first 8-12k chars after the lead.
  const sourceText = extract.substring(0, 14000)

  // ── Anthropic tool_use for guaranteed-valid JSON output ────────────
  //
  // Earlier iteration sent a prompt + parsed text response, but Claude
  // sometimes outputs unescaped ASCII quotes inside Lithuanian descriptions
  // („„Yellow"") that JSON.parse rejects. Switching to tool_use forces the
  // model to emit a structured object matching the schema — Anthropic
  // handles all escaping internally, and we receive the eras as a real JS
  // object via `content[].input`.
  // Schema'a sąmoningai paprasta — Anthropic tool_use validacija atmeta
  // kai kuriuos JSON Schema feature'us (type unions, minItems/maxItems).
  // year_end laikom ne-required (jei null/ongoing — Claude jį tiesiog
  // praleidžia, mes konvertuojam į null).
  const tool = {
    name: 'submit_eras',
    description: 'Pateik atlikėjo karjeros laikotarpius (eras) lietuvių kalba.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eras: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Trumpas LT pavadinimas, 1-3 žodžiai (pvz., Pradžia, Klasika, Stadium pop, Eksperimentai, Comeback). Be kabučių aplink.' },
              year_start: { type: 'integer', description: 'Laikotarpio pradžios metai (pvz., 1999).' },
              year_end: { type: 'integer', description: 'Pabaigos metai. Jei laikotarpis tęsiasi iki dabar — praleisk šitą lauką visiškai.' },
              description: { type: 'string', description: '1-2 sakiniai LT. Albumų pavadinimus rašyk LT kabutėmis.' },
            },
            required: ['title', 'year_start', 'description'],
          },
        },
      },
      required: ['eras'],
    },
  }

  const prompt = `Esi muzikos enciklopedijos redaktorius lietuviškam portalui music.lt. Tau pateikiamas Wikipedia atlikėjo straipsnio tekstas. Tavo užduotis — išgauti MUZIKINIUS karjeros LAIKOTARPIUS (eras) ir pateikti per submit_eras tool.

ATLIKĖJO WIKI STRAIPSNIS:
"""
${sourceText}
"""

SVARBIAUSIA — TIK MUZIKINĖ INFORMACIJA:
- TURINYS turi būti TIK apie muziką — albumai, hit'ai, žanro pokyčiai, koncertų turai, kūrybinis kelias.
- NEMINĖK: asmeninio gyvenimo dramos, teismų, konservatorijos, sveikatos problemų, skandalų, šeimos santykių. Tai pop kultūra, ne muzika.
- Era pavadinimai turi atspindėti MUZIKINĮ pokytį, ne biografinį (NEgalima: „Atsitraukimas", „Pertrauka", „Konservatorija"; GALIMA: „Klasika", „Comeback", „Eksperimentai", „Brandos era", „Pop princesė").

KIEK ERAS: privalai pateikti BENT 3 eras (idealu 4–6). Jei tekstas trumpas — sukurk eras pagal albumų išleidimo metus.

KIEKVIENAI ERAI:
- title: TRUMPAS lietuviškas pavadinimas, 1–3 žodžiai, muzikinis kontekstas. Pavyzdžiai: Pradžia, Klasika, Stadium pop, Eksperimentai, Solo karjera, Comeback, Brandos era, Pop princesė, Disco era, R&B periodas.
- year_start: skaičius (pvz., 1999).
- year_end: skaičius arba PRALEISK lauką visiškai, jei era tęsiasi iki dabar.
- description: 1–2 sakiniai lietuvių kalba APIE MUZIKĄ. Įvardyk pagrindinius albumus pavadinimais originalia kalba: „...Baby One More Time", „Toxic", „In the Zone". Kalbėk apie garsą, žanrą, komercinę sėkmę — ne apie biografiją.

Sortuok NUO NAUJAUSIO Į SENIAUSIĄ (pirmas elementas = naujausia era). Nesutapyk metų intervalų.

Pateik per submit_eras tool. Privaloma kvietimas — tekstinis atsakymas neleistinas. eras lauke pateik tikrą JSON masyvą (ne string'ą).`

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 2500,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'submit_eras' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!apiRes.ok) {
    const errBody = await apiRes.text().catch(() => '')
    return NextResponse.json({ error: `Claude API: ${apiRes.status} ${errBody.slice(0, 300)}` }, { status: 502 })
  }
  const apiData = await apiRes.json()
  // Find tool_use block in content. Some models put it as first content
  // item, some interleave with text — search all entries.
  const toolUseBlock = (apiData.content || []).find((c: any) => c.type === 'tool_use')
  if (!toolUseBlock || !toolUseBlock.input) {
    return NextResponse.json({
      error: 'AI negrąžino tool_use bloko',
      stop_reason: apiData.stop_reason,
      raw: JSON.stringify(apiData).slice(0, 2000),
    }, { status: 502 })
  }
  // Accept multiple shapes Claude might return:
  //   { eras: [...] }            — what we asked for
  //   { eras: "[...]" }          — Claude wraps array in string. The string
  //                                often has unescaped ASCII " around album
  //                                titles, so plain JSON.parse fails — we
  //                                run safeParse() which repairs inner quotes.
  //   [...]                       — direct array
  //   { period_X: {...}, ... }    — object map of era objects
  //
  // safeParse char-walks the string, detects `"` chars that are inside string
  // values (not delimiters) and rewrites them to a LT closing quote, then
  // retries JSON.parse. Heuristic: a `"` is a delimiter only if it's
  // followed by whitespace + one of `,}]:` (or EOF).
  function safeParse(s: string): any {
    try { return JSON.parse(s) } catch (_) { /* fall through */ }
    const repaired: string[] = []
    let inString = false
    let escaped = false
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (escaped) {
        repaired.push(c); escaped = false; continue
      }
      if (c === '\\') {
        repaired.push(c); escaped = true; continue
      }
      if (c === '"') {
        if (!inString) {
          inString = true; repaired.push(c)
        } else {
          // Look ahead for delimiter.
          let j = i + 1
          while (j < s.length && /\s/.test(s[j])) j++
          const next = s[j]
          if (next === ',' || next === '}' || next === ']' || next === ':' || next === undefined) {
            inString = false; repaired.push(c)
          } else {
            repaired.push('“') // inner — rewrite
          }
        }
        continue
      }
      repaired.push(c)
    }
    const fixed = repaired.join('').replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(fixed)
  }

  let eras: any[] = []
  let candidate: any = toolUseBlock.input.eras
  let parseErr: string | null = null
  let parserPath = 'unknown'
  if (typeof candidate === 'string') {
    const s = candidate.trim()
    if (s.startsWith('[')) {
      try { candidate = safeParse(s); parserPath = 'string→safeParse' } catch (e: any) { parseErr = e.message; parserPath = 'safeParse-failed' }
    } else {
      parserPath = `string-not-array(starts:${s.slice(0, 20)})`
    }
  } else if (Array.isArray(candidate)) {
    parserPath = 'native-array'
  } else {
    parserPath = `non-string-non-array(type:${typeof candidate})`
  }
  if (Array.isArray(candidate)) {
    eras = candidate
  } else if (Array.isArray(toolUseBlock.input)) {
    eras = toolUseBlock.input
    parserPath += '+fallback-input-array'
  } else if (typeof toolUseBlock.input === 'object') {
    const vals = Object.values(toolUseBlock.input).filter((v: any) =>
      v && typeof v === 'object' && 'title' in v && 'year_start' in v,
    )
    if (vals.length > 0) { eras = vals as any[]; parserPath += '+object-map' }
  }
  if (eras.length === 0) {
    return NextResponse.json({
      error: 'AI grąžino tuščią eras masyvą',
      stop_reason: apiData.stop_reason,
      sourceLength: extract.length,
      parserPath,
      parseErr,
      toolInput: JSON.stringify(toolUseBlock.input).slice(0, 1000),
    }, { status: 502 })
  }
  const rows: Era[] = eras.map((r: any, idx: number) => ({
    sort_order: idx,
    title: String(r.title || '').trim(),
    subtitle: null,
    year_start: typeof r.year_start === 'number' ? r.year_start : parseInt(String(r.year_start)) || new Date().getFullYear(),
    year_end: r.year_end == null ? null : (typeof r.year_end === 'number' ? r.year_end : parseInt(String(r.year_end))),
    description: r.description ? String(r.description).trim() : null,
    source: 'ai_wikipedia',
  }))

  return NextResponse.json({ rows, wikiTitle, sourceLength: extract.length })
}
