/**
 * /api/admin/concert-recordings/[id]
 *
 * PATCH  — atnaujinti įrašo laukus (title, artist_id, venue, city, recorded_*,
 *          recording_type, is_published, is_featured, sort_order...).
 *          Pakeitus artist_id — perskaičiuojami denorm. styles[].
 * DELETE — ištrinti įrašą.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { stylesForArtist } from '@/lib/concert-recordings'

function revalidateRecordings() {
  try { revalidatePath('/koncertu-irasai'); revalidateTag('artist') } catch { /* best-effort */ }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = ['full', 'special', 'session']

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const recId = Number(id)
  if (!Number.isFinite(recId)) return NextResponse.json({ ok: false, error: 'Blogas id' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 })
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title.trim()
  if (body.recording_type && TYPES.includes(body.recording_type)) patch.recording_type = body.recording_type
  if ('venue' in body) patch.venue = body.venue?.toString().trim() || null
  if ('city' in body) patch.city = body.city?.toString().trim() || null
  if ('country' in body) patch.country = body.country?.toString().trim() || null
  if ('recorded_on' in body) patch.recorded_on = body.recorded_on || null
  if ('recorded_year' in body) patch.recorded_year = Number.isFinite(Number(body.recorded_year)) ? Number(body.recorded_year) : null
  if ('duration_seconds' in body) patch.duration_seconds = Number.isFinite(Number(body.duration_seconds)) ? Number(body.duration_seconds) : null
  if (typeof body.is_published === 'boolean') patch.is_published = body.is_published
  if (typeof body.is_featured === 'boolean') patch.is_featured = body.is_featured
  if (Number.isFinite(Number(body.sort_order))) patch.sort_order = Number(body.sort_order)

  try {
    const sb = createAdminClient()

    // Atlikėjo keitimas → perskaičiuojam vardą + stilius
    if ('artist_id' in body) {
      const artistId = Number(body.artist_id) || null
      patch.artist_id = artistId
      if (artistId) {
        const { data: a } = await sb.from('artists').select('name').eq('id', artistId).maybeSingle()
        patch.artist_name_cached = a?.name ?? null
        patch.styles = await stylesForArtist(artistId)
      } else {
        patch.styles = []
      }
    } else if (body.refresh_styles) {
      // Aiškus prašymas perskaičiuoti stilius (jei atlikėjo žanrai pasikeitė)
      const { data: cur } = await sb.from('concert_recordings').select('artist_id').eq('id', recId).maybeSingle()
      if (cur?.artist_id) patch.styles = await stylesForArtist(cur.artist_id)
    }

    const { error } = await sb.from('concert_recordings').update(patch).eq('id', recId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    revalidateRecordings()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const recId = Number(id)
  if (!Number.isFinite(recId)) return NextResponse.json({ ok: false, error: 'Blogas id' }, { status: 400 })
  try {
    const sb = createAdminClient()
    const { error } = await sb.from('concert_recordings').delete().eq('id', recId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    revalidateRecordings()
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
