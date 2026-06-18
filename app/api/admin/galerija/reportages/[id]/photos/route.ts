// /api/admin/galerija/reportages/[id]/photos
//
// POST   — pridėti nuotraukas. Body: { photos:[{url, flickr_id?, caption?,
//          width?, height?}], rehost?:bool }. rehost=true → re-host'inam į mūsų
//          covers bucket'ą (durable). Siųsk batch'ais (~5) kad nesibaigtų laikas.
// DELETE  — pašalinti vieną nuotrauką: ?photoId=123
//
// Po kiekvieno pakeitimo perskaičiuojam photo_count ir nustatom cover_url (jei tuščias).

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { rehostImage } from '@/lib/galerija-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

/** Perskaičiuoja photo_count ir užpildo cover_url pirmąja nuotrauka jei tuščias. */
async function resync(sb: ReturnType<typeof createAdminClient>, reportageId: string | number) {
  const { data: photos } = await sb
    .from('reportage_photos')
    .select('url')
    .eq('reportage_id', reportageId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  const count = photos?.length || 0
  const patch: any = { photo_count: count, updated_at: new Date().toISOString() }
  const { data: rep } = await sb.from('reportages').select('cover_url').eq('id', reportageId).maybeSingle()
  if ((!rep?.cover_url || count === 0) && photos?.[0]?.url) patch.cover_url = photos[0].url
  if (count === 0) patch.cover_url = rep?.cover_url || null
  await sb.from('reportages').update(patch).eq('id', reportageId)
  return count
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }

  const photos: any[] = Array.isArray(body?.photos) ? body.photos : []
  if (!photos.length) return NextResponse.json({ ok: false, error: 'Nėra nuotraukų' }, { status: 400 })
  const rehost = body?.rehost !== false
  // Visam batch'ui priskiriama grupė (atlikėjas arba tagas) — neprivaloma.
  const groupArtistId = Number(body?.group_artist_id) || null
  const groupTag = !groupArtistId && body?.group_tag ? body.group_tag.toString().trim() || null : null

  try {
    const sb = createAdminClient()
    // Pradinis sort_order = esamų max + 1
    const { data: last } = await sb.from('reportage_photos').select('sort_order').eq('reportage_id', id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    let order = (last?.sort_order ?? -1) + 1

    const rows: any[] = []
    const errors: string[] = []
    for (const p of photos) {
      const src = (p?.url || '').toString().trim()
      if (!src) continue
      let finalUrl = src
      if (rehost) {
        try { finalUrl = await rehostImage(src) } catch (e: any) { errors.push(`${src.slice(-24)}: ${e?.message || 'rehost'}`); continue }
      }
      rows.push({
        reportage_id: Number(id),
        url: finalUrl,
        thumb_url: null,
        caption: p?.caption?.toString().trim() || null,
        width: Number.isFinite(Number(p?.width)) ? Number(p.width) : null,
        height: Number.isFinite(Number(p?.height)) ? Number(p.height) : null,
        flickr_id: p?.flickr_id?.toString() || null,
        artist_id: groupArtistId,
        tag: groupTag,
        sort_order: order++,
      })
    }

    let inserted = 0
    if (rows.length) {
      const { data, error } = await sb.from('reportage_photos').insert(rows).select('id')
      if (error) return NextResponse.json({ ok: false, error: error.message, errors }, { status: 500 })
      inserted = data?.length || 0
    }
    const count = await resync(sb, id)
    return NextResponse.json({ ok: true, inserted, total: count, errors })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

// PATCH — priskirti grupę pasirinktoms nuotraukoms. Body: { photoIds:number[],
// artist_id?:number|null, tag?:string|null }. artist_id IR tag null = nuimti grupę.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 }) }
  const ids = (Array.isArray(body?.photoIds) ? body.photoIds : []).map(Number).filter(Boolean)
  if (!ids.length) return NextResponse.json({ ok: false, error: 'Nepasirinkta nuotraukų' }, { status: 400 })

  const artistId = Number(body?.artist_id) || null
  const tag = !artistId && body?.tag ? body.tag.toString().trim() || null : null
  try {
    const sb = createAdminClient()
    const { error } = await sb
      .from('reportage_photos')
      .update({ artist_id: artistId, tag })
      .in('id', ids)
      .eq('reportage_id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: ids.length })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const photoId = req.nextUrl.searchParams.get('photoId')
  if (!photoId) return NextResponse.json({ ok: false, error: 'Trūksta photoId' }, { status: 400 })
  try {
    const sb = createAdminClient()
    const { error } = await sb.from('reportage_photos').delete().eq('id', photoId).eq('reportage_id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const count = await resync(sb, id)
    return NextResponse.json({ ok: true, total: count })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
