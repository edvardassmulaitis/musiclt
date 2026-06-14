// POST /api/studija/bio-assist — AI pagalba bio rašymui (Haiku).
// Body: { artistId, current, mode: 'improve'|'shorten'|'expand', name? }

import { NextRequest, NextResponse } from 'next/server'
import { requireStudioAccess } from '@/lib/artist-studio'

const INSTR: Record<string, string> = {
  improve: 'Perrašyk profesionaliau ir sklandžiau, išlaikydamas faktus ir esmę.',
  shorten: 'Sutrumpink iki 1–2 glaustų pastraipų, palik tik svarbiausią.',
  expand: 'Praplėsk iki 2–3 pastraipų, pridėk konteksto apie stilių ir muziką (neišgalvok faktų).',
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })

  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const mode = INSTR[body?.mode] ? body.mode : 'improve'
  const current = String(body?.current || '').trim().slice(0, 4000)
  const name = String(body?.name || '').slice(0, 120)
  if (!current && mode !== 'expand') return NextResponse.json({ error: 'Nėra teksto' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI nesukonfigūruotas' }, { status: 503 })

  const prompt = `Esi muzikos portalo Music.lt redaktorius. Žemiau — atlikėjo „${name}" profilio aprašymas.

${INSTR[mode]}

Rašyk LIETUVIŲ kalba, natūraliai, be perdėto pompastiškumo. Grąžink TIK galutinį tekstą, be antraščių ar komentarų.

Dabartinis tekstas:
---
${current || '(tuščia)'}
---`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    })
    const data = await res.json()
    const text = data?.content?.[0]?.text?.trim() || ''
    if (!text) return NextResponse.json({ error: 'AI negrąžino teksto' }, { status: 502 })
    return NextResponse.json({ ok: true, text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI klaida' }, { status: 500 })
  }
}
