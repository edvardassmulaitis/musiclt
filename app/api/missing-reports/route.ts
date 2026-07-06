// app/api/missing-reports/route.ts
//
// POST — narys praneša apie trūkstamą atlikėją/dainą/albumą ("matau, kad kažko nėra").
// Įrašoma į public.missing_reports; admin peržiūri /admin/atradimai.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const KINDS = new Set(['artist', 'track', 'album', 'kita'])

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = (body.name || '').toString().trim()
  if (!name || name.length < 2) {
    return NextResponse.json({ error: 'Įrašyk pavadinimą' }, { status: 400 })
  }
  const kind = KINDS.has(body.kind) ? body.kind : 'artist'
  const sb = createAdminClient()
  const session = await getServerSession(authOptions).catch(() => null)
  const ip = req.headers.get('x-real-ip')?.trim()
    || (req.headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean).pop()
    || null

  const { error } = await sb.from('missing_reports').insert({
    kind,
    name: name.slice(0, 200),
    artist_hint: (body.artist_hint || '').toString().trim().slice(0, 200) || null,
    note: (body.note || '').toString().trim().slice(0, 1000) || null,
    source_url: (body.source_url || '').toString().trim().slice(0, 500) || null,
    context: (body.context || 'muzikos-atradimai').toString().slice(0, 80),
    reporter_id: (session?.user as any)?.id || null,
    reporter_ip: ip,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
