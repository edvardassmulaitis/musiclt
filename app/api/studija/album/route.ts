// /api/studija/album — atlikėjas valdo savo albumus / leidinius.
//   POST   { artistId, title, type?, year?, month?, day?, cover_image_url?, description?, trackIds? } → sukuria
//   PATCH  { artistId, albumId, title?, type?, year?, month?, day?, cover_image_url?, description?, trackIds? } → redaguoja
//   DELETE { artistId, albumId } → ištrina (tik atlikėjo sukurtą, be legacy_id)
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'
import { slugify } from '@/lib/slugify'

// Albumo „tipas" → boolean stulpelis. Vienu metu aktyvus tik vienas.
const TYPE_COLS = ['type_studio', 'type_ep', 'type_single', 'type_live', 'type_compilation', 'type_remix', 'type_covers', 'type_holiday', 'type_soundtrack', 'type_demo'] as const
const TYPE_KEYS: Record<string, typeof TYPE_COLS[number]> = {
  studio: 'type_studio', ep: 'type_ep', single: 'type_single', live: 'type_live',
  compilation: 'type_compilation', remix: 'type_remix', covers: 'type_covers',
  holiday: 'type_holiday', soundtrack: 'type_soundtrack', demo: 'type_demo',
}

function typeFlags(type?: string) {
  const flags: any = {}
  for (const c of TYPE_COLS) flags[c] = false
  const col = type && TYPE_KEYS[type]
  flags[col || 'type_studio'] = true
  return flags
}

function dateFields(body: any) {
  const out: any = {}
  if ('year' in body) out.year = body.year != null && body.year !== '' ? Number(body.year) : null
  if ('month' in body) { const m = Number(body.month); out.month = m >= 1 && m <= 12 ? m : null }
  if ('day' in body) { const d = Number(body.day); out.day = d >= 1 && d <= 31 ? d : null }
  return out
}

/** Perrašo albumo dainų sąrašą (album_tracks) + atnaujina track_count. */
async function syncTracks(sb: any, albumId: number, artistId: number, trackIds: any) {
  if (!Array.isArray(trackIds)) return
  // Tik šio atlikėjo dainos — apsauga nuo svetimų ID injekcijos.
  const ids = trackIds.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
  let valid: number[] = []
  if (ids.length) {
    const { data: own } = await sb.from('tracks').select('id').eq('artist_id', artistId).in('id', ids)
    const ownSet = new Set((own || []).map((t: any) => t.id))
    valid = ids.filter((id: number) => ownSet.has(id))
  }
  await sb.from('album_tracks').delete().eq('album_id', albumId)
  if (valid.length) {
    const rows = valid.map((id, i) => ({ album_id: albumId, track_id: id, position: i + 1 }))
    await sb.from('album_tracks').insert(rows)
  }
  await sb.from('albums').update({ track_count: valid.length }).eq('id', albumId)
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const title = String(body?.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Įrašyk pavadinimą' }, { status: 400 })

  const sb = createAdminClient()
  const slug = `${slugify(title).slice(0, 80)}-${Date.now().toString(36)}`
  const d = dateFields(body)
  const row: any = {
    artist_id: artistId, title: title.slice(0, 300), slug,
    year: d.year ?? null, month: d.month ?? null, day: d.day ?? null,
    cover_image_url: body.cover_image_url || null,
    description: typeof body.description === 'string' ? body.description.slice(0, 4000) : null,
    is_upcoming: !!body.is_upcoming,
    ...typeFlags(body.type),
  }
  const { data, error } = await sb.from('albums').insert(row).select('id, slug, title').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (Array.isArray(body.trackIds)) await syncTracks(sb, data.id, artistId, body.trackIds)
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true, album: data })
}

export async function PATCH(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), albumId = Number(body?.albumId)
  if (!Number.isFinite(artistId) || !Number.isFinite(albumId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const sb = createAdminClient()
  const { data: al } = await sb.from('albums').select('id, artist_id').eq('id', albumId).maybeSingle()
  if (!al || al.artist_id !== artistId) return NextResponse.json({ error: 'Albumas nerastas' }, { status: 404 })

  const patch: any = {}
  if (typeof body.title === 'string') {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: 'Pavadinimas tuščias' }, { status: 400 })
    patch.title = t.slice(0, 300) // slug NEKEIČIAM
  }
  const d = dateFields(body)
  if ('year' in d) patch.year = d.year
  if ('month' in d) patch.month = d.month
  if ('day' in d) patch.day = d.day
  if (typeof body.type === 'string') Object.assign(patch, typeFlags(body.type))
  if ('cover_image_url' in body) patch.cover_image_url = body.cover_image_url || null
  if (typeof body.description === 'string') patch.description = body.description.slice(0, 4000)
  if ('is_upcoming' in body) patch.is_upcoming = !!body.is_upcoming

  if (Object.keys(patch).length) {
    const { error } = await sb.from('albums').update(patch).eq('id', albumId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (Array.isArray(body.trackIds)) await syncTracks(sb, albumId, artistId, body.trackIds)
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), albumId = Number(body?.albumId)
  if (!Number.isFinite(artistId) || !Number.isFinite(albumId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const sb = createAdminClient()
  const { data: al } = await sb.from('albums').select('id, artist_id, legacy_id').eq('id', albumId).maybeSingle()
  if (!al || al.artist_id !== artistId) return NextResponse.json({ error: 'Albumas nerastas' }, { status: 404 })
  if (al.legacy_id != null) return NextResponse.json({ error: 'Šio albumo trinti negalima (importuotas iš senojo music.lt).' }, { status: 400 })

  await sb.from('album_tracks').delete().eq('album_id', albumId)
  const { error } = await sb.from('albums').delete().eq('id', albumId).is('legacy_id', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true })
}
