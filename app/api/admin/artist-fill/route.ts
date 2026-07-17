/**
 * POST /api/admin/artist-fill
 *
 * Vieno-click AI atlikėjo užpildymas (grounded per MusicBrainz + Sonnet).
 * Grąžina import JSON, kurį admin įklijuoja/peržiūri per esamą
 * `/admin/artist-import` srautą (validateImportJson → buildPreview → applyImport).
 *
 * Žr. lib/artist-fill.ts komentarą dėl kodėl grounding būtinas (Haiku testų
 * išvada). Migracijos NEreikia — naudoja esamą import pipeline'ą.
 *
 * Request body: { name: string }   // atlikėjo pavadinimas (arba „Atlikėjas - Albumas")
 * Response: { ok, json, model, grounded, grounding_summary, mb_release_count }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { fillArtist } from '@/lib/artist-fill'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Neteisingas request body' }, { status: 400 })
  }

  const name = typeof body?.name === 'string' ? body.name : ''
  if (!name.trim()) {
    return NextResponse.json({ error: 'Nurodyk atlikėjo pavadinimą' }, { status: 400 })
  }

  const result = await fillArtist(name)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json(result)
}
