// AI-powered era generator.
//
// POST /api/admin/artists/[id]/eras/generate
//   body: { wikiUrl?: string, artistName?: string }
//
// Simplification 2026-05-13: previously this endpoint scraped Wikipedia
// and fed the article into Claude for extraction. That was over-engineered
// — Claude knows the major artists from training data, no scrape needed.
//
// New pipeline:
//   1. Resolve artist name (from URL/title input or fall back to DB).
//   2. Ask Claude directly to produce eras from its own knowledge.
//   3. Use tool_use for guaranteed-structured JSON output.
//
// Removed: Wikipedia fetch, User-Agent juggling, summary fallback,
// safeParse repair (tool_use already handles escaping).
//
// Returns: { rows: Era[], artistName: string }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

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

function parseArtistName(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // Wikipedia URL: take the last path segment
  const m = trimmed.match(/\/wiki\/([^#?]+)/)
  if (m) return decodeURIComponent(m[1]).replace(/_/g, ' ')
  return trimmed
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const rawInput: string = body.wikiUrl || body.wikiTitle || body.artistName || ''
  let artistName = parseArtistName(rawInput)
  // Fallback — if no input, fetch artist name from DB
  if (!artistName) {
    const sb = createAdminClient()
    const { data: artist } = await sb.from('artists').select('name').eq('id', parseInt(id)).single()
    if (artist?.name) artistName = artist.name
  }
  if (!artistName) return NextResponse.json({ error: 'Negalim nustatyti atlikėjo vardo' }, { status: 400 })

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

  const prompt = `Esi muzikos enciklopedijos redaktorius lietuviškam portalui music.lt. Tavo užduotis — sukurti MUZIKINIUS karjeros LAIKOTARPIUS (eras) atlikėjui "${artistName}" iš savo žinių, ir pateikti juos per submit_eras tool.

ATLIKĖJAS: ${artistName}

Naudok savo žinias apie šitą atlikėją — albumus, hit'us, žanro pokyčius, kūrybinį kelią. NEREIKIA fetch'inti Wikipedia ar kitų išorinių šaltinių — viskas iš tavo training data.

SVARBIAUSIA — TIK MUZIKINĖ INFORMACIJA:
- TURINYS turi būti TIK apie muziką — albumai, hit'ai, žanro pokyčiai, koncertų turai, kūrybinis kelias.
- NEMINĖK: asmeninio gyvenimo dramos, teismų, konservatorijos, sveikatos problemų, skandalų, šeimos santykių. Tai pop kultūra, ne muzika.
- Era pavadinimai turi atspindėti MUZIKINĮ pokytį, ne biografinį (NEgalima: „Atsitraukimas", „Pertrauka", „Konservatorija"; GALIMA: „Klasika", „Comeback", „Eksperimentai", „Brandos era").

KIEK ERAS: privalai pateikti BENT 3 eras (idealu 4–6).

KIEKVIENAI ERAI:
- title: TRUMPAS lietuviškas pavadinimas, 1–3 žodžiai, muzikinis kontekstas. Pavyzdžiai: Pradžia, Klasika, Stadium pop, Eksperimentai, Solo karjera, Comeback, Brandos era, Pop princesė, Disco era, R&B periodas.
- year_start: skaičius (pvz., 1999).
- year_end: skaičius arba PRALEISK lauką visiškai, jei era tęsiasi iki dabar.
- description: 1–2 sakiniai lietuvių kalba APIE MUZIKĄ. Įvardyk pagrindinius albumus pavadinimais originalia kalba. Kalbėk apie garsą, žanrą, komercinę sėkmę.

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
      artistName,
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

  return NextResponse.json({ rows, artistName })
}
