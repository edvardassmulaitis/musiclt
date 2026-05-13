// Admin CRUD for artist_eras.
//
// GET  /api/admin/artists/[id]/eras       → list rows (artist_id)
// POST /api/admin/artists/[id]/eras       → bulk replace; body { rows: Era[] }
//
// Bulk replace simplifies the admin UI: client maintains the full list,
// posts it back on every save. Server diff'ina pagal id (existing rows
// be id are deleted, new rows be id are inserted).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type EraRow = {
  id?: number
  sort_order: number
  title: string
  subtitle: string | null
  year_start: number
  year_end: number | null
  description: string | null
  featured_album_ids?: number[] | null
  source?: string | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const artistId = parseInt(id)
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('artist_eras')
    .select('id, sort_order, title, subtitle, year_start, year_end, description, featured_album_ids, source')
    .eq('artist_id', artistId)
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin','super_admin'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params
  const artistId = parseInt(id)
  const body = await req.json()
  const rows: EraRow[] = body.rows || []

  const sb = createAdminClient()
  // Delete all existing rows for this artist, then re-insert. Simpler than
  // diffing; era counts per artist are small (1-10 rows) so cost is trivial.
  const { error: delErr } = await sb
    .from('artist_eras')
    .delete()
    .eq('artist_id', artistId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0 })

  const insertRows = rows.map((r, idx) => ({
    artist_id: artistId,
    sort_order: r.sort_order ?? idx,
    title: r.title,
    subtitle: r.subtitle || null,
    year_start: r.year_start,
    year_end: r.year_end ?? null,
    description: r.description || null,
    featured_album_ids: r.featured_album_ids || [],
    source: r.source || 'manual',
  }))
  const { data, error } = await sb
    .from('artist_eras')
    .insert(insertRows)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: data?.length || 0 })
}
