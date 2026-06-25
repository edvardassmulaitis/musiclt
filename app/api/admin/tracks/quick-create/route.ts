/**
 * Quick-create track per admin/inbox wizard'ą.
 *
 * Naudojama, kai AI iš straipsnio paminėjo dainą, bet jos nėra DB'oje. User'is
 * spaudžia „Sukurti" — mes priimame:
 *   - title         (required)
 *   - artist_id     (required, iš candidate'o suggested artists)
 *   - youtube_url   (optional, bet REKOMENDUOJAMA — naudojam thumb'ui)
 *
 * Grąžinam:
 *   - track_id
 *   - title, artist_name (UI display)
 *
 * Ne pilnai automatinis YT enrich'as — admin/tracks/[id]/page'e galima
 * smulkiau redaguoti, čia tik bazinis insert + video_url save.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { extractVideoIdFromUrl } from '@/lib/yt-innertube'
import { recallResolution, findConfidentMatch, rememberResolution } from '@/lib/chart-resolve'

export const runtime = 'nodejs'

function slugifyLt(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ą]/g, 'a').replace(/[č]/g, 'c').replace(/[ę]/g, 'e')
    .replace(/[ė]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const title: string | undefined = typeof body.title === 'string' ? body.title.trim() : undefined
  const artistId: number | undefined = typeof body.artist_id === 'number' ? body.artist_id : undefined
  const youtubeUrl: string | null = typeof body.youtube_url === 'string' && body.youtube_url ? body.youtube_url : null

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const supabase = createAdminClient()

  // Sanity: artist exists?
  const { data: artist, error: aErr } = await supabase
    .from('artists').select('id, name').eq('id', artistId).maybeSingle()
  if (aErr || !artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
  }

  // ─── Duplicate guard — 3 pakopos, kad nesikurtų katalogo šiukšlės ───
  // 2026-06-25: anksčiau buvo TIK exact ilike(title) → „Iceman" vs „Iceman
  // (Official Video)" kūrė dublikatus. Dabar pridėtas memory-recall + fuzzy
  // catalog match (tas pats matcher'is kaip chart import'e), scope'as — TIK
  // šio atlikėjo katalogas.

  // 1) Pastovi atmintis (chart_resolution_memory) — jei kada nors jau sujungta.
  try {
    const recalled = await recallResolution(supabase, artist.name, title, 'track')
    if (recalled?.trackId) {
      const { data: t } = await supabase
        .from('tracks').select('id, title, slug').eq('id', recalled.trackId).maybeSingle()
      if (t) {
        return NextResponse.json({
          track_id: t.id, title: t.title, slug: (t as any).slug,
          artist_name: artist.name, already_existed: true, dedup: 'memory',
        })
      }
    }
  } catch { /* recall best-effort */ }

  // 2) Fuzzy confident match (to paties atlikėjo kataloge) — pagauna variantus
  //    su „(Official Video)", didžiosiomis, & vs and, ir pan.
  try {
    const m = await findConfidentMatch(supabase, artist.name, title, { fuzzy: true })
    if (m?.trackId) {
      const { data: t } = await supabase
        .from('tracks').select('id, title, slug').eq('id', m.trackId).maybeSingle()
      if (t) {
        return NextResponse.json({
          track_id: t.id, title: t.title, slug: (t as any).slug,
          artist_name: artist.name, already_existed: true, dedup: 'fuzzy',
        })
      }
    }
  } catch { /* match best-effort */ }

  // 3) Exact ilike guard (paskutinė apsauga)
  const { data: existing } = await supabase
    .from('tracks')
    .select('id, title, slug')
    .eq('artist_id', artistId)
    .ilike('title', title)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      track_id: existing.id,
      title: existing.title,
      slug: (existing as any).slug,
      artist_name: artist.name,
      already_existed: true,
      dedup: 'exact',
    })
  }

  // Next track ID + unique slug
  const slugBase = slugifyLt(title) || `track-${Date.now()}`
  let finalSlug = slugBase
  for (let attempt = 0; attempt < 50; attempt++) {
    const { data: exSlug } = await supabase
      .from('tracks').select('id').eq('slug', finalSlug).maybeSingle()
    if (!exSlug) break
    finalSlug = `${slugBase}-${attempt + 1}`
  }

  // Validuojam YT URL (jei nevalidus — saugom NULL)
  let validatedYoutube: string | null = null
  let videoEmbeddable: boolean | null = null
  if (youtubeUrl) {
    const vid = extractVideoIdFromUrl(youtubeUrl)
    if (vid) {
      // Normalizuojam į stabilų formatą
      validatedYoutube = `https://www.youtube.com/watch?v=${vid}`
      // VEVO/blocked video pre-validation per YouTube oEmbed endpoint'ą.
      // Jei video blokuojamas embed'ams (VEVO domain restrictions, region,
      // private), oEmbed grąžina 4xx. Atmetam track creation, kad nebūtų
      // broken iframe newsletter'e.
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`,
          { signal: AbortSignal.timeout(4000) }
        )
        videoEmbeddable = oembedRes.ok
        if (!oembedRes.ok) {
          return NextResponse.json({
            error: `YouTube video blokuojamas embed'ams (galimai VEVO ar region-restricted). Pasirink kitą versiją (audio only, lyric video, cover) per YouTube paiešką.`,
            code: 'EMBED_BLOCKED',
            video_id: vid,
          }, { status: 400 })
        }
      } catch {
        // Timeout arba network error — palikti embeddable=null, nebrokint
        // creation (geriau leisti ir let user'is later spręsti)
        videoEmbeddable = null
      }
    }
  }

  const { data: created, error: insErr } = await supabase
    .from('tracks')
    .insert({
      title,
      slug: finalSlug,
      artist_id: artistId,
      video_url: validatedYoutube,
      video_embeddable: videoEmbeddable,
      // created_at default per DB
    })
    .select('id, title, slug')
    .single()

  if (insErr || !created) {
    return NextResponse.json({ error: `Track create failed: ${insErr?.message}` }, { status: 500 })
  }

  // Įsimenam į pastovią atmintį — kad kitas tas pats embed'as/paminėjimas
  // ateityje atpažintų šitą track'ą, o ne kurtų dublikatą.
  await rememberResolution(supabase, {
    rawArtist: artist.name, rawTitle: title, kind: 'track',
    trackId: created.id, artistId, state: 'matched',
  })

  return NextResponse.json({
    track_id: created.id,
    title: created.title,
    artist_name: artist.name,
    slug: created.slug,
    youtube_url: validatedYoutube,
  })
}
