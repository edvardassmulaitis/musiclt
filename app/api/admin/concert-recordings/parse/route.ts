/**
 * POST /api/admin/concert-recordings/parse
 *
 * Admin „greitas pridėjimas": YouTube nuoroda → metaduomenys (trukmė, įkėlimo
 * data, peržiūros) + AI pasiūlymai (vieta, miestas, koncerto data, tipas,
 * atlikėjas). Nieko neįrašo — tik grąžina preview, kurį admin redaguoja.
 *
 * Body: { url: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { parseConcertUrl } from '@/lib/concert-recordings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 })
  }

  const url = (body?.url || '').toString().trim()
  if (!url) return NextResponse.json({ ok: false, error: 'Trūksta nuorodos' }, { status: 400 })

  try {
    const parsed = await parseConcertUrl(url)
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error || 'Nepavyko' }, { status: 422 })
    return NextResponse.json({ ok: true, parsed })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
