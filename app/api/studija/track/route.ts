// POST /api/studija/track — atlikėjas prideda naują dainą iš YouTube nuorodos.
// Body: { artistId, url }
import { NextRequest, NextResponse } from 'next/server'
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
  return NextResponse.json({ ok: true, track: data })
}
