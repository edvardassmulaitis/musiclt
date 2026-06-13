// /api/admin/galerija/reportages/[id]
//
// GET    — vienas reportažas + jo nuotraukos (admin redagavimui).
// PATCH  — atnaujinti laukus.
// DELETE — pašalinti reportažą (nuotraukos krenta per cascade).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

const FIELDS = [
  'title', 'intro', 'artist_id', 'photographer_id', 'event_name', 'venue', 'city',
  'event_date', 'cover_url', 'flickr_album_url', 'source_url', 'is_published', 'is_featured', 'published_at',
]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const sb = createAdminClient()
    const { data: reportage } = await sb.from('reportages').select('*').eq('id', id).maybeSingle()
    if (!reportage) return NextResponse.json({ ok: false, error: 'Nerasta' }, { status: 404 })
    const { data: photos } = await sb
      .from('reportage_photos')
      .select('id, url, thumb_url, caption, flickr_id, sort_order')
      .eq('reportage_id', id)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    return NextResponse.json({ ok: true, reportage, photos: photos || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }

  const patch: any = { updated_at: new Date().toISOString() }
  for (const f of FIELDS) {
    if (!(f in body)) continue
    if (f === 'artist_id' || f === 'photographer_id') patch[f] = Number(body[f]) || null
    else if (f === 'is_published' || f === 'is_featured') patch[f] = !!body[f]
    else patch[f] = body[f] === '' ? null : body[f]
  }

  try {
    const sb = createAdminClient()
    const { error } = await sb.from('reportages').update(patch).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const sb = createAdminClient()
    const { error } = await sb.from('reportages').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
