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
//   3. Plain-text response with `---` block delimiters — far more
//      forgiving than JSON when descriptions contain quotes.
//
// Removed: Wikipedia fetch, User-Agent juggling, tool_use schema
// (kept failing with stringified arrays), safeParse JSON repair
// (kept failing on edge cases like „Foo": colon).
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

  // Plain-text format with hard delimiters — switched from tool_use after
  // multiple iterations of JSON parsing issues (Claude wrapping arrays in
  // strings, unescaped ASCII quotes inside descriptions, etc.). Text format
  // is more forgiving: we split on `---` and parse `key: value` lines, so
  // there are no escape concerns even when descriptions contain quotes.
  const prompt = `Esi muzikos enciklopedijos redaktorius lietuviškam portalui music.lt. Tavo užduotis — sukurti MUZIKINIUS karjeros LAIKOTARPIUS (eras) atlikėjui "${artistName}" iš savo žinių.

ATLIKĖJAS: ${artistName}

Naudok savo žinias apie šitą atlikėją — albumus, hit'us, žanro pokyčius, kūrybinį kelią.

SVARBIAUSIA — TIK MUZIKINĖ INFORMACIJA:
- TURINYS turi būti TIK apie muziką — albumai, hit'ai, žanro pokyčiai, koncertų turai, kūrybinis kelias.
- NEMINĖK: asmeninio gyvenimo dramos, teismų, konservatorijos, sveikatos problemų, skandalų, šeimos santykių.
- Era pavadinimai turi atspindėti MUZIKINĮ pokytį, ne biografinį (NEgalima: „Atsitraukimas", „Pertrauka", „Konservatorija"; GALIMA: „Klasika", „Comeback", „Eksperimentai", „Brandos era").

KIEK ERAS: privalai pateikti BENT 3 eras (idealu 4–6).

GRĄŽINK TIKSLIAI ŠITOKĮ FORMATĄ (3-6 blokai atskirti \`---\`):

title: Trumpas LT pavadinimas (1-3 žodžiai)
year_start: 2019
year_end:
description: Vienas-du sakiniai LT su albumų pavadinimais.
---
title: Stadium pop
year_start: 2008
year_end: 2018
description: Foo „Albumas A", „Albumas B" ir t.t.
---

TAISYKLĖS:
- Kiekviena era atskirta tiksliai trimis brūkšneliais (\`---\`) ant savo eilutės.
- 4 laukai per erą: title, year_start, year_end, description. Jokio kito teksto.
- year_end — jei era tęsiasi iki dabar, palik tuščią (po dvitaškio nieko nerašyk).
- description — 1-2 sakiniai. Naudok LT kabutes „...". Jokių kitų \`---\` viduje.
- Sortuok NUO NAUJAUSIO į seniausiausią.
- Be jokio papildomo teksto prieš ar po blokų. NE markdown, NE JSON. Tik plain text su \`---\` separator.

Pradėk iškart pirmu \`title:\`.`

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!apiRes.ok) {
    const errBody = await apiRes.text().catch(() => '')
    return NextResponse.json({ error: `Claude API: ${apiRes.status} ${errBody.slice(0, 300)}` }, { status: 502 })
  }
  const apiData = await apiRes.json()
  const rawText: string = (apiData.content || []).find((c: any) => c.type === 'text')?.text || ''
  if (!rawText) {
    return NextResponse.json({
      error: 'AI negrąžino teksto',
      stop_reason: apiData.stop_reason,
      raw: JSON.stringify(apiData).slice(0, 800),
    }, { status: 502 })
  }

  // Parse plain-text format: blocks separated by `---`, each with
  // `key: value` lines.
  const blocks = rawText
    .split(/\n[\s]*---[\s]*\n/)
    .map(b => b.trim())
    .filter(b => /title\s*:/i.test(b))

  const rows: Era[] = []
  for (const block of blocks) {
    const fields: Record<string, string> = {}
    let lastKey: string | null = null
    for (const line of block.split('\n')) {
      const m = line.match(/^([a-z_]+)\s*:\s*(.*)$/i)
      if (m) {
        const key = m[1].toLowerCase()
        fields[key] = m[2].trim()
        lastKey = key
      } else if (lastKey && line.trim()) {
        fields[lastKey] = (fields[lastKey] + ' ' + line.trim()).trim()
      }
    }
    if (!fields.title) continue
    const yearStart = parseInt(fields.year_start) || 0
    if (!yearStart) continue
    const yearEnd = fields.year_end ? parseInt(fields.year_end) || null : null
    rows.push({
      sort_order: rows.length,
      title: fields.title,
      subtitle: null,
      year_start: yearStart,
      year_end: yearEnd,
      description: fields.description || null,
      source: 'ai_claude',
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({
      error: 'Nepavyko išparse\'inti AI atsakymo (0 eras)',
      stop_reason: apiData.stop_reason,
      artistName,
      raw: rawText.slice(0, 1500),
    }, { status: 502 })
  }

  return NextResponse.json({ rows, artistName })
}
