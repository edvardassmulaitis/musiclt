// /api/admin/galerija/reportages
//
// GET  — visi reportažai (įsk. nepublikuotus), naujausi pirmi.
// POST — sukurti reportažą. Body: { title, intro?, artist_id?, photographer_id?,
//        event_name?, venue?, city?, event_date?, cover_url?, flickr_album_url?,
//        source_url?, is_published?, is_featured? }

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

function cleanTitle(t: string): string {
  return t.replace(/^FOTO\s+(REPORTA[ŽZ]AS|GALERIJA)\s*\|\s*/i, '').trim()
}

async function uniqueSlug(sb: ReturnType<typeof createAdminClient>, title: string): Promise<string> {
  const base = slugify(cleanTitle(title) || 'reportazas', 70) || 'reportazas'
  const candidates = [base, `${base}-${Math.random().toString(36).slice(2, 6)}`, `${base}-${Date.now().toString(36)}`]
  for (const c of candidates) {
    const { data } = await sb.from('reportages').select('id').eq('slug', c).maybeSingle()
    if (!data) return c
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('reportages')
      .select('id, slug, title, artist_id, photographer_id, event_name, venue, city, event_date, cover_url, photo_count, is_published, is_featured, published_at, created_at, artists:artist_id(name), photographers:photographer_id(name)')
      .order('published_at', { ascending: false })
      .limit(500)
    return NextResponse.json({ ok: true, items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }

  const title = (body?.title || '').toString().trim()
  if (!title) return NextResponse.json({ ok: false, error: 'Trūksta pavadinimo' }, { status: 400 })

  // Line-up (keli atlikėjai). Pirmas = primary (artist_id).
  const lineup = (Array.isArray(body?.artists) ? body.artists : [])
    .map((a: any, i: number) => ({ artist_id: Number(a?.artist_id) || null, role: a?.role?.toString().trim() || null, sort_order: i }))
    .filter((a: any) => a.artist_id)
  const primaryArtist = lineup[0]?.artist_id ?? (Number(body?.artist_id) || null)

  try {
    const sb = createAdminClient()
    const slug = await uniqueSlug(sb, title)
    const row = {
      slug,
      title,
      intro: body?.intro?.toString() || null,
      artist_id: primaryArtist,
      photographer_id: Number(body?.photographer_id) || null,
      event_id: body?.event_id || null,
      event_name: body?.event_name?.toString().trim() || null,
      venue: body?.venue?.toString().trim() || null,
      city: body?.city?.toString().trim() || null,
      event_date: body?.event_date || null,
      cover_url: body?.cover_url?.toString().trim() || null,
      flickr_album_url: body?.flickr_album_url?.toString().trim() || null,
      source_url: body?.source_url?.toString().trim() || null,
      is_published: body?.is_published === false ? false : true,
      is_featured: !!body?.is_featured,
      published_at: body?.published_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await sb.from('reportages').insert(row).select('id, slug').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (lineup.length) {
      await sb.from('reportage_artists').insert(lineup.map((a: any) => ({ reportage_id: data.id, ...a })))
    }
    return NextResponse.json({ ok: true, id: data.id, slug: data.slug })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
