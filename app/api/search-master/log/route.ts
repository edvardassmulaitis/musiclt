import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

/**
 * Logging click'ų iš master search modal'o.
 *
 * Kai user'is pasirenka rezultatą iš autosuggest dropdown'o, UI fire'ina
 * fetch'ą šitam endpoint'ui. Saugom click'ą su:
 *   - entity_type ('artists' | 'tracks' | ...)
 *   - entity_id (numeric kategorijoms su BIGINT id)
 *   - entity_uuid (events — uuid)
 *   - query (kokios buvo užklausos string'as)
 *   - user_id (jei prisijungęs)
 *
 * Failure'as silent — niekada neblokuojam navigation'o dėl logging
 * problemos (analytics-grade priority, ne user-facing).
 *
 * Body: { entity_type, entity_id, query }
 */

export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body?.entity_type || body?.id === undefined) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const session = await getServerSession(authOptions).catch(() => null)
  const userId = (session?.user as any)?.id || null

  // Atskiriam numeric id (artists/tracks/albums) nuo uuid (events)
  const idVal = body.id
  const isNumeric = typeof idVal === 'number' || (typeof idVal === 'string' && /^\d+$/.test(idVal))
  const entity_id = isNumeric ? Number(idVal) : 0
  const entity_uuid = isNumeric ? null : String(idVal)

  const sb = createAdminClient()
  // fire-and-forget — error tik log'inam, ne grąžinam klientui
  sb.from('search_clicks')
    .insert({
      entity_type: String(body.entity_type),
      entity_id,
      entity_uuid,
      query: body.query ? String(body.query).slice(0, 200) : null,
      user_id: userId,
    })
    .then(({ error }: any) => {
      if (error) console.error('[search-log] insert failed:', error.message)
    })

  return NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
