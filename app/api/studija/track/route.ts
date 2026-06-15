// /api/studija/track — atlikėjas valdo savo dainas.
//   POST   { artistId, url }                                  → prideda dainą iš YouTube
//   PATCH  { artistId, trackId, title?, year?, month?, day? }  → redaguoja
//   DELETE { artistId, trackId }                              → ištrina (tik atlikėjo pridėtą, be legacy_id)
import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase'
import { requireStudioAccess } from '@/lib/artist-studio'
import { youtubeId } from '@/lib/social-embed'
import { fetchVideoMeta } from '@/lib/social/youtube'
import { slugify } from '@/lib/slugify'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId)
  if (!Number.isFinite(artistId)) return NextResponse.json({ error: 'Trūksta artistId' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const vid = youtubeId(String(body?.url || ''))
  if (!vid) return NextResponse.json({ error: 'Įklijuok teisingą YouTube nuorodą' }, { status: 400 })

  const sb = createAdminClient()
  const videoUrl = `https://www.youtube.com/watch?v=${vid}`
  const { data: existing } = await sb.from('tracks').select('id').eq('artist_id', artistId).eq('video_url', videoUrl).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, already: true, id: existing.id })

  let meta
  try { meta = await fetchVideoMeta(vid) } catch (e: any) { return NextResponse.json({ error: e?.message || 'YouTube klaida' }, { status: 502 }) }
  if (!meta || !meta.title) return NextResponse.json({ error: 'Nepavyko gauti video info' }, { status: 502 })

  const slug = `${slugify(meta.title).slice(0, 80)}-${vid.toLowerCase()}`
  const pub = meta.publishedAt ? new Date(meta.publishedAt) : null
  const row: any = {
    artist_id: artistId, title: meta.title.slice(0, 300), slug,
    video_url: videoUrl, video_uploaded_at: meta.publishedAt, video_views: meta.views,
    video_embeddable: true, is_new_date: new Date().toISOString(),
  }
  if (pub) { row.release_year = pub.getFullYear(); row.release_month = pub.getMonth() + 1; row.release_day = pub.getDate() }

  const { data, error } = await sb.from('tracks').insert(row).select('id, slug, title').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true, track: data })
}

export async function PATCH(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), trackId = Number(body?.trackId)
  if (!Number.isFinite(artistId) || !Number.isFinite(trackId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const sb = createAdminClient()
  const { data: tr } = await sb.from('tracks').select('id, artist_id').eq('id', trackId).maybeSingle()
  if (!tr || tr.artist_id !== artistId) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })

  const patch: any = {}
  // Pavadinimas — slug NEKEIČIAM (vieša nuoroda / SEO stabilumas).
  if (typeof body.title === 'string') {
    const t = body.title.trim()
    if (!t) return NextResponse.json({ error: 'Pavadinimas tuščias' }, { status: 400 })
    patch.title = t.slice(0, 300)
  }
  // Išleidimo data — atskira nuo video_uploaded_at (jo NELIEČIAM: pagal jį
  // filtruojamos „Naujausios" + skaičiuojamas Top 40 tinkamumas).
  if ('year' in body || 'month' in body || 'day' in body) {
    const y = body.year != null && body.year !== '' ? Number(body.year) : null
    const m = body.month != null && body.month !== '' ? Number(body.month) : null
    const d = body.day != null && body.day !== '' ? Number(body.day) : null
    if (y != null && (!Number.isFinite(y) || y < 1900 || y > 2100)) return NextResponse.json({ error: 'Blogi metai' }, { status: 400 })
    patch.release_year = y
    patch.release_month = m && m >= 1 && m <= 12 ? m : null
    patch.release_day = d && d >= 1 && d <= 31 ? d : null
    patch.release_date = (y && patch.release_month && patch.release_day)
      ? `${y}-${String(patch.release_month).padStart(2, '0')}-${String(patch.release_day).padStart(2, '0')}`
      : null
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nėra ką keisti' }, { status: 400 })
  patch.updated_at = new Date().toISOString()

  const { error } = await sb.from('tracks').update(patch).eq('id', trackId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Blogas body' }, { status: 400 }) }
  const artistId = Number(body?.artistId), trackId = Number(body?.trackId)
  if (!Number.isFinite(artistId) || !Number.isFinite(trackId)) return NextResponse.json({ error: 'Trūksta laukų' }, { status: 400 })
  const { ok, reason } = await requireStudioAccess(artistId)
  if (!ok) return NextResponse.json({ error: reason }, { status: reason === 'unauthenticated' ? 401 : 403 })

  const sb = createAdminClient()
  const { data: tr } = await sb.from('tracks').select('id, artist_id, legacy_id').eq('id', trackId).maybeSingle()
  if (!tr || tr.artist_id !== artistId) return NextResponse.json({ error: 'Daina nerasta' }, { status: 404 })
  // Apsauga: legacy (importuotos) dainos NETRINAMOS — tik atlikėjo per zoną pridėtos.
  if (tr.legacy_id != null) return NextResponse.json({ error: 'Šios dainos trinti negalima (importuota iš senojo music.lt).' }, { status: 400 })

  await sb.from('album_tracks').delete().eq('track_id', trackId)
  const { error } = await sb.from('tracks').delete().eq('id', trackId).is('legacy_id', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  try { revalidateTag('artist') } catch {}
  return NextResponse.json({ ok: true })
}
