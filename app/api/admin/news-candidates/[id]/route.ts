/**
 * Admin actions per single candidate'ą.
 *
 * GET    /api/admin/news-candidates/{id}        — full detail
 * PATCH  /api/admin/news-candidates/{id}        — { action: 'approve'|'reject', reject_reason? }
 *   approve → inserts į news() table'ę su AI-generated content'u
 *   reject  → status='rejected', reason saugomas
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { extractVideoIdFromUrl } from '@/lib/yt-innertube'

export const runtime = 'nodejs'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user.role as string) || '')) {
    return null
  }
  return session
}

function slugifyLt(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ą]/g, 'a').replace(/[č]/g, 'c').replace(/[ę]/g, 'e')
    .replace(/[ė]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('news_candidates')
    .select(`
      *,
      primary_artist:artists!news_candidates_primary_artist_id_fkey(id, name, slug, cover_image_url)
    `)
    .eq('id', candidateId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Pridėti suggested artists su pavadinimais (BIGINT[] → look up)
  let suggestedArtists: Array<{ id: number; name: string; slug: string }> = []
  if (data.suggested_artist_ids && data.suggested_artist_ids.length > 0) {
    const { data: arts } = await supabase
      .from('artists')
      .select('id, name, slug, cover_image_url')
      .in('id', data.suggested_artist_ids)
    suggestedArtists = (arts || []) as any[]
  }

  // Email attachments + EXIF metadata (jeigu yra Gmail šaltinio candidate'as)
  const { data: imagesRows } = await supabase
    .from('news_candidate_images')
    .select('id, public_url, filename, mime_type, file_size, photographer, copyright, year_taken, caption_exif, caption, photographer_override, copyright_override, year_override, source, sort_order')
    .eq('candidate_id', candidateId)
    .order('sort_order', { ascending: true })

  return NextResponse.json({
    candidate: data,
    suggested_artists: suggestedArtists,
    attachments: imagesRows || [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const candidateId = parseInt(id, 10)
  if (Number.isNaN(candidateId)) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action as string | undefined
  const supabase = createAdminClient()

  // Load candidate
  const { data: cand, error: loadErr } = await supabase
    .from('news_candidates')
    .select('*')
    .eq('id', candidateId)
    .single()

  if (loadErr || !cand) {
    return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
  }
  if (cand.status !== 'pending') {
    return NextResponse.json({ error: `Already ${cand.status}` }, { status: 409 })
  }

  if (action === 'reject') {
    // 2026-05-18: pakeitėm soft delete (status='rejected') į HARD DELETE.
    // Reason: Edvardas nenori, kad atmestos naujienos kauptųsi DB ir foto
    // kabotų Supabase Storage'e. Sequence:
    //   1) gauk attachment storage_path'us (kol FK CASCADE nepripuolė)
    //   2) DELETE candidate row → CASCADE trina news_candidate_images
    //   3) Storage.remove(paths) — atskirai, Supabase neturi DB → Storage trigger'io
    //   4) gmail_seen_messages: jei gmail source — update filter_reason='admin_rejected'
    //      (paliekam eilutę dedupe'ui, kad tas pats Gmail thread'as
    //      grįžęs nepakliūtų antrąkart)

    const { data: imgRows } = await supabase
      .from('news_candidate_images')
      .select('storage_path')
      .eq('candidate_id', candidateId)
    const storagePaths: string[] = (imgRows || [])
      .map((r: any) => r.storage_path)
      .filter(Boolean)

    const { error: delErr } = await supabase
      .from('news_candidates')
      .delete()
      .eq('id', candidateId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (storagePaths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from('news-attachments')
        .remove(storagePaths)
      if (storageErr) {
        // Nefail'inam — candidate jau trinta. Log'inam orphan files.
        console.warn('[reject] storage cleanup failed:', storageErr.message, storagePaths)
      }
    }

    if (cand.source_type === 'gmail' && cand.source_email_thread_id) {
      await supabase
        .from('gmail_seen_messages')
        .update({ filter_reason: 'admin_rejected', candidate_id: null })
        .eq('thread_id', cand.source_email_thread_id)
    }

    return NextResponse.json({
      ok: true,
      status: 'deleted',
      images_removed: storagePaths.length,
    })
  }

  if (action === 'approve') {
    // Build news INSERT payload from candidate + optional body overrides
    const overrideTitle = (body.title as string | undefined) || cand.ai_title
    const overrideBody  = (body.body  as string | undefined) || cand.ai_body
    const overrideImage = (body.image_url as string | undefined) || cand.suggested_image_url

    // Build slug
    let slugBase = slugifyLt(overrideTitle)
    if (!slugBase) slugBase = `news-${Date.now()}`

    // Next ID + unique slug
    const { data: maxRow } = await supabase
      .from('news').select('id').order('id', { ascending: false }).limit(1).single()
    const nextId = (maxRow?.id || 0) + 1

    let finalSlug = slugBase
    let attempt = 0
    while (true) {
      const { data: ex } = await supabase
        .from('news').select('id').eq('slug', finalSlug).maybeSingle()
      if (!ex) break
      attempt++
      finalSlug = `${slugBase}-${attempt}`
    }

    // Body — diskretiška source nuoroda (be portalo reklamavimo)
    const bodyWithSource = cand.source_url
      ? `${overrideBody}\n\n<p class="news-source"><a href="${escapeAttr(cand.source_url)}" target="_blank" rel="noopener" class="text-xs text-gray-400 hover:text-gray-600">pagal pirminį šaltinį</a></p>`
      : overrideBody

    // ─── Track IDs (wizard override pre body.track_ids[], else AI suggested) ───
    // Parsing'as deklaruojamas anksti, kad auto-image YT thumb fallback'as
    // galėtų pasinaudoti.
    const wizardTrackIdsEarly: number[] | undefined = Array.isArray(body.track_ids)
      ? body.track_ids.filter((x: any) => typeof x === 'number' && x > 0)
      : undefined
    const trackIds: number[] = wizardTrackIdsEarly || (cand.suggested_track_ids || []) as number[]

    // ─── Atlikėjų priskirimas (wizard'as gali override'inti) ───
    // body.artist_ids — wizard'o galutinis atlikėjų sąrašas eiliškumu (primary pirmas)
    // body.primary_artist_id — wizard'o pasirinktas primary (default = pirmas iš artist_ids)
    // Jei nepateikta — fallback į candidate'o AI siūlymus
    const wizardArtistIds: number[] | undefined = Array.isArray(body.artist_ids) ? body.artist_ids : undefined
    const allArtistIds: number[] = wizardArtistIds
      ? wizardArtistIds.filter(x => typeof x === 'number' && x > 0)
      : (cand.suggested_artist_ids || []) as number[]

    const wizardPrimary: number | undefined = typeof body.primary_artist_id === 'number' ? body.primary_artist_id : undefined
    const artistId1: number | null = wizardPrimary
      || cand.primary_artist_id
      || allArtistIds[0]
      || null

    // artist_id2 legacy slot: pirmas iš sąrašo, kuris NE artistId1
    const artistId2: number | null = artistId1
      ? (allArtistIds.find((id: number) => id !== artistId1) ?? null)
      : (allArtistIds[1] ?? null)

    // ─── Auto image picker ───
    // Pirmenybė:
    //   1) user'io override (wizard image — pirma iš image_urls array, jei
    //      pateikta wizard'e; arba legacy single image_url)
    //   2) naujausia artist_photo
    //   3) artist.cover_image_url
    //   4) YouTube thumbnail iš pirmojo track'o su video_url
    //   5) NULL
    // body.image_urls — multi-image: pirma = hero, kitos → image1..5_url legacy slots.
    const wizardImages: string[] = Array.isArray(body.image_urls)
      ? body.image_urls.filter((x: any) => typeof x === 'string' && x).slice(0, 5)
      : ((body.image_url as string | undefined) ? [body.image_url as string] : [])
    let finalImage: string | null = wizardImages[0] || (body.image_url as string | undefined) || null
    if (!finalImage && artistId1) {
      const { data: photos } = await supabase
        .from('artist_photos')
        .select('url')
        .eq('artist_id', artistId1)
        .order('sort_order', { ascending: true })
        .limit(1)
      if (photos && photos.length > 0 && photos[0].url) {
        finalImage = photos[0].url
      } else {
        const { data: artist } = await supabase
          .from('artists')
          .select('cover_image_url')
          .eq('id', artistId1)
          .maybeSingle()
        finalImage = artist?.cover_image_url || null
      }
    }
    // YT thumb fallback'as iš track'ų su video_url
    if (!finalImage && trackIds.length > 0) {
      const { data: trackWithVideo } = await supabase
        .from('tracks')
        .select('video_url')
        .in('id', trackIds)
        .not('video_url', 'is', null)
        .limit(1)
        .maybeSingle()
      if (trackWithVideo?.video_url) {
        const videoId = extractVideoIdFromUrl(trackWithVideo.video_url)
        if (videoId) {
          finalImage = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        }
      }
    }

    // Multi-image: pirma → image_title + image_small (hero). Likusios 2-5 →
    // image1_url..image4_url legacy slots (image5_url paliktas atskirai).
    const galleryImages = wizardImages.slice(1, 5)
    const { data: created, error: insErr } = await supabase
      .from('news')
      .insert({
        id: nextId,
        slug: finalSlug,
        title: overrideTitle,
        body: bodyWithSource,
        type: 'news',
        author_id: (session.user as any).id || null,
        source_url: cand.source_url,
        source_name: cand.source_portal,
        artist_id: artistId1,
        artist_id2: artistId2,
        image_small_url: finalImage,
        image_title_url: finalImage,
        image1_url: galleryImages[0] || null,
        image2_url: galleryImages[1] || null,
        image3_url: galleryImages[2] || null,
        image4_url: galleryImages[3] || null,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('id, slug')
      .single()

    if (insErr) {
      return NextResponse.json({ error: `Publish failed: ${insErr.message}` }, { status: 500 })
    }

    // ─── news_artists junction: ALL atlikėjai, ne tik 2 legacy slot'ai ───
    // Pirmas allArtistIds == primary. Order'is iš wizard'o (jei pateikta) arba AI siūlymo.
    if (allArtistIds.length > 0) {
      const naRows = allArtistIds.map((aid, idx) => ({
        news_id: created.id,
        artist_id: aid,
        is_primary: aid === artistId1,
        sort_order: idx,
      }))
      const { error: naErr } = await supabase.from('news_artists').insert(naRows)
      if (naErr) {
        // Lentelė gali dar neegzistuoti (jeigu migracija 20260515g neaplikuota).
        // Ne fail'inam — news jau publikuota, legacy artist_id/artist_id2 turi pagrindinius.
        console.warn('[approve] news_artists insert failed (migration applied?):', naErr.message)
      }
    }

    // ─── news_songs: pridėti track'us + embed URLs ───
    const songsToInsert: Array<{ news_id: number; sort_order: number; song_id?: number; title?: string; artist_name?: string; youtube_url?: string }> = []

    // trackIds jau deklaruoti aukščiau (anksti, kad auto-image YT thumb veiktų).
    if (trackIds.length > 0) {
      const { data: tracks } = await supabase
        .from('tracks')
        .select('id, title, video_url, artists!tracks_artist_id_fkey(name)')
        .in('id', trackIds)
      for (let i = 0; i < (tracks?.length || 0); i++) {
        const t: any = (tracks as any[])[i]
        songsToInsert.push({
          news_id: created.id,
          sort_order: i,
          song_id: t.id,
          title: t.title,
          artist_name: t.artists?.name || '',
          youtube_url: t.video_url || '',
        })
      }
    }

    // 2) Embed URLs iš source'o (jei track'as nebuvo matched — vis tiek rodome video)
    const embeds: string[] = (cand.embed_urls || []) as string[]
    let order = songsToInsert.length
    for (const url of embeds) {
      // Skipinam dublikatus jeigu tracks jau turi tą video_url
      if (songsToInsert.some(s => s.youtube_url === url)) continue
      songsToInsert.push({
        news_id: created.id,
        sort_order: order++,
        title: '',
        artist_name: '',
        youtube_url: url,
      })
    }

    if (songsToInsert.length > 0) {
      const { error: songsErr } = await supabase
        .from('news_songs')
        .insert(songsToInsert)
      if (songsErr) {
        // Log bet ne fail'inti — naujiena jau publikuota
        console.warn('[approve] news_songs insert failed:', songsErr.message)
      }
    }

    // Mark candidate approved. reviewed_by laikinai NEpaduodamas — column yra
    // INTEGER, o session.user.id yra UUID. Anksčiau šis update silent fail'indavo,
    // dėl ko approved candidate'ai likdavo 'pending' ir grįždavo į inbox'ą po refresh.
    const { error: candUpdErr } = await supabase
      .from('news_candidates')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        published_news_id: created.id,
      })
      .eq('id', candidateId)
    if (candUpdErr) {
      // News jau publikuotos — log'inam, bet ne fail'inam (geriau dublikatas inbox'e
      // nei prarasta publikuota naujiena).
      console.error('[approve] candidate status update failed:', candUpdErr.message)
    }

    // Cache invalidation — naujiena ką tik atsirado homepage'o feed'e.
    try {
      const { revalidateHomeTag } = await import('@/lib/home-latest')
      revalidateHomeTag('news')
    } catch {}

    return NextResponse.json({
      ok: true,
      status: 'approved',
      news_id: created.id,
      slug: created.slug,
      artist_id: artistId1,
      songs_added: songsToInsert.length,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
