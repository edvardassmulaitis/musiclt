/**
 * /api/admin/concert-recordings
 *
 * GET  — admin sąrašas (visi, įsk. nepublikuotus), naujausi pirmi.
 * POST — sukurti įrašą. Body: {
 *   youtube_id, youtube_url, title, artist_id?, duration_seconds?, recording_type,
 *   venue?, city?, country?, recorded_on?, recorded_year?, uploaded_at?, channel?,
 *   description?, thumbnail_url?, view_count?, is_featured?, is_published?
 * }
 * styles[] denormalizuojami iš atlikėjo žanrų automatiškai.
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { slugify } from '@/lib/slugify'
import { stylesForArtist } from '@/lib/concert-recordings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPES = ['full', 'special', 'session']

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user.role as string) || '')) return null
  return session
}

/** Unikalus slug: bazė iš title; jei užimta — pridedam youtube_id gabalą. */
async function uniqueSlug(sb: ReturnType<typeof createAdminClient>, title: string, youtubeId: string): Promise<string> {
  const base = slugify(title || 'koncertas', 70) || 'koncertas'
  const candidates = [base, `${base}-${youtubeId.slice(0, 6).toLowerCase()}`, `${base}-${youtubeId.toLowerCase()}`]
  for (const c of candidates) {
    const { data } = await sb.from('concert_recordings').select('id').eq('slug', c).maybeSingle()
    if (!data) return c
  }
  return `${base}-${Date.now().toString(36)}`
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select('id, slug, youtube_id, title, artist_id, artist_name_cached, duration_seconds, recording_type, venue, city, recorded_on, recorded_year, uploaded_at, view_count, styles, is_published, is_featured, thumbnail_url, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    return NextResponse.json({ ok: true, items: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Neteisingas body' }, { status: 400 })
  }

  const youtubeId = (body?.youtube_id || '').toString().trim()
  const title = (body?.title || '').toString().trim()
  if (!youtubeId) return NextResponse.json({ ok: false, error: 'Trūksta youtube_id' }, { status: 400 })
  if (!title) return NextResponse.json({ ok: false, error: 'Trūksta pavadinimo' }, { status: 400 })

  const recordingType = TYPES.includes(body?.recording_type) ? body.recording_type : 'full'
  const artistId = Number(body?.artist_id) || null

  try {
    const sb = createAdminClient()

    // Dublikato apsauga per youtube_id
    const { data: existing } = await sb.from('concert_recordings').select('id, slug').eq('youtube_id', youtubeId).maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: false, error: 'Šis YouTube įrašas jau pridėtas', existingId: existing.id, existingSlug: existing.slug }, { status: 409 })
    }

    // Atlikėjo vardas + denorm. stiliai
    let artistName: string | null = null
    let styles: string[] = []
    if (artistId) {
      const { data: a } = await sb.from('artists').select('name').eq('id', artistId).maybeSingle()
      artistName = a?.name ?? null
      styles = await stylesForArtist(artistId)
    }

    const slug = await uniqueSlug(sb, title, youtubeId)

    const row = {
      slug,
      youtube_id: youtubeId,
      youtube_url: (body?.youtube_url || `https://www.youtube.com/watch?v=${youtubeId}`).toString(),
      title,
      artist_id: artistId,
      artist_name_cached: artistName,
      duration_seconds: Number.isFinite(Number(body?.duration_seconds)) ? Number(body.duration_seconds) : null,
      recording_type: recordingType,
      venue: body?.venue?.toString().trim() || null,
      city: body?.city?.toString().trim() || null,
      country: body?.country?.toString().trim() || null,
      recorded_on: body?.recorded_on || null,
      recorded_year: Number.isFinite(Number(body?.recorded_year)) ? Number(body.recorded_year) : null,
      uploaded_at: body?.uploaded_at || null,
      channel: body?.channel?.toString().trim() || null,
      description: body?.description?.toString() || null,
      thumbnail_url: body?.thumbnail_url?.toString() || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      view_count: Number.isFinite(Number(body?.view_count)) ? Number(body.view_count) : null,
      styles,
      is_published: body?.is_published === false ? false : true,
      is_featured: !!body?.is_featured,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await sb.from('concert_recordings').insert(row).select('id, slug').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    // Iškart matomas /koncertu-irasai + atlikėjo puslapyje (ISR cache purge)
    try {
      revalidatePath('/koncertu-irasai')
      revalidatePath(`/koncertu-irasai/${data.slug}`)
      revalidateTag('artist')
    } catch { /* revalidate best-effort */ }

    return NextResponse.json({ ok: true, id: data.id, slug: data.slug })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Klaida' }, { status: 500 })
  }
}
