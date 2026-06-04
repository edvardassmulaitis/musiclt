/**
 * Atlikėjų kontaktai (vadybininkų bazė).
 *
 *   GET    /api/admin/contacts?type=&search=&artist_id=&limit=
 *          → { contacts: [...] }  (su artist join: name, slug)
 *   POST   /api/admin/contacts    { artist_id, name, type, email, phone, url, confidence }
 *   DELETE /api/admin/contacts?id=<uuid>
 *
 * Lentelė: artist_contacts (migracija 20260604_artist_json_import.sql).
 * Visi keliai — admin/super_admin only, per service-role klientą.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const CONTACT_TYPES = [
  'business', 'management', 'booking', 'press', 'label', 'event_organizer',
  'potential_management', 'potential_label', 'potential_booking', 'general',
]
const CONFIDENCE = ['high', 'medium', 'low']

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) return null
  return session
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') || ''
  const search = (sp.get('search') || '').trim()
  const artistId = sp.get('artist_id')
  const limit = Math.min(parseInt(sp.get('limit') || '500'), 1000)

  let q = sb
    .from('artist_contacts')
    .select('id, artist_id, name, type, email, phone, url, confidence, source, created_at, artists(name, slug)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type) q = q.eq('type', type)
  if (artistId) q = q.eq('artist_id', Number(artistId))
  if (search) q = q.or(`name.ilike.%${search}%,email.ilike.%${search}%,url.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const contacts = (data || []).map((c: any) => ({
    id: c.id, artist_id: c.artist_id, name: c.name, type: c.type,
    email: c.email, phone: c.phone, url: c.url, confidence: c.confidence,
    source: c.source, created_at: c.created_at,
    artist_name: c.artists?.name || null, artist_slug: c.artists?.slug || null,
  }))
  return NextResponse.json({ contacts, total: contacts.length })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Neteisingas body' }, { status: 400 }) }

  const artist_id = Number(body.artist_id)
  if (!artist_id) return NextResponse.json({ error: 'artist_id privalomas' }, { status: 400 })
  const type = CONTACT_TYPES.includes(body.type) ? body.type : 'general'
  const confidence = CONFIDENCE.includes(body.confidence) ? body.confidence : 'medium'

  const row = {
    artist_id,
    name: body.name?.trim() || null,
    type,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    url: body.url?.trim() || null,
    confidence,
    source: 'manual',
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await sb.from('artist_contacts').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createAdminClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id privalomas' }, { status: 400 })
  const { error } = await sb.from('artist_contacts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
