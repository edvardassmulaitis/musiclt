// Shared helper — computes album + per-track completeness state.
// Naudojama PATCH /api/albums/[id]/enrich (return state po update'o) IR
// GET /api/albums/[id]/completeness (read-only check be modifikacijų).
//
// Track "complete" definicija (admin perspective):
//   - has video_url   (be jo player neveiks)
//   - has release_year (be datos sort'inimas/timeline'ai sulūš)
//   - has lyrics      (jei ne instrumental)
//
// Album "complete" definicija:
//   - has cover_image_url
//   - has year
//   - bent 1 substyle (žanras)
//   - VISOS jo dainos individualiai complete

import type { SupabaseClient } from '@supabase/supabase-js'

export type TrackCompleteness = {
  id: number
  title: string
  type: string
  complete: boolean
  missing: string[]
  likes_count: number
  comments_count: number
}

export type AlbumCompleteness = {
  has_cover: boolean
  has_year: boolean
  has_full_date: boolean
  has_peak: boolean
  has_certifications: boolean
  substyles_count: number
  tracks_count: number
  tracks: TrackCompleteness[]
  /** Visos linked dainos individualiai complete (video_url + release_year + lyrics/instrumental). */
  all_tracks_complete: boolean
  /** Album'as fully complete: meta + visi tracks. Frontend rodo žalią ✓ tik šitą TRUE. */
  fully_complete: boolean
  /** Music.lt legacy URL + community engagement metrics — admin'ui matyti
   *  ar verta detaliau tvarkyti šį album'ą (didelis like/comment count =
   *  populiarus tarp music.lt vartotojų). null jei album scrape'as nesusietas
   *  su legacy_id. */
  legacy_id?: number | null
  legacy_url?: string | null
  legacy_slug?: string | null
  likes_count: number
  comments_count: number
  /** Esamos type flags DB — frontend palygins su Wiki ketinama type'a
   *  ir parodys 'studijinis → kompiliacija' diff jei keisis. */
  current_types: string[]
  /** Admin reviewed/cleared status — naudojama Wiki import filter'avimui.
   *  null = needs review; 'cleared' = admin patvirtino kad DB state'as
   *  yra OK ir nereikia papildomai tvarkyti. */
  wiki_review_status: string | null
}

export async function computeAlbumCompleteness(
  sb: SupabaseClient,
  albumId: number
): Promise<AlbumCompleteness | null> {
  const { data: album } = await sb
    .from('albums')
    .select('cover_image_url, year, month, day, peak_chart_position, certifications, legacy_id, slug, type_studio, type_compilation, type_ep, type_single, type_live, type_remix, type_covers, type_holiday, type_soundtrack, type_demo')
    .eq('id', albumId)
    .single()
  if (!album) return null

  // wiki_review_status — optional column iš 20260515h migracijos. Bandom
  // atskirai, kad query'as veiktų ir tuo atveju kai migracija dar neaplikuota.
  let wiki_review_status: string | null = null
  try {
    const { data: meta, error: metaErr } = await sb
      .from('albums')
      .select('wiki_review_status')
      .eq('id', albumId)
      .maybeSingle()
    if (!metaErr) wiki_review_status = (meta as any)?.wiki_review_status || null
  } catch { /* ignore — migration not yet applied */ }

  const { data: subRows } = await sb
    .from('album_substyles')
    .select('substyle_id')
    .eq('album_id', albumId)

  // Likes/comments counts — community engagement signal for admin.
  // Likes per `likes` lentelę (entity_type='album'), comments per `comments`
  // (album_id direct foreign key). Naudojam HEAD count'ą — nereikia row
  // duomenų, tik skaičių.
  const [likesResp, commentsResp] = await Promise.all([
    sb.from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'album')
      .eq('entity_id', albumId),
    sb.from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('album_id', albumId)
      .eq('is_deleted', false),
  ])
  const likes_count = (likesResp as any).count ?? 0
  const comments_count = (commentsResp as any).count ?? 0

  const legacy_id = (album as any).legacy_id || null
  const legacy_slug = (album as any).slug || null
  const legacy_url = legacy_id
    ? `https://www.music.lt/lt/albumas/${encodeURIComponent(legacy_slug || 'x')}/${legacy_id}/`
    : null

  const { data: trackRows } = await sb
    .from('album_tracks')
    .select('track_id, position, tracks(id, title, type, video_url, lyrics, release_year)')
    .eq('album_id', albumId)
    .order('position', { ascending: true })

  const tracks: TrackCompleteness[] = []
  const trackIdList: number[] = []
  for (const r of (trackRows || []) as any[]) {
    const t = r.tracks
    if (!t) continue
    const missing: string[] = []
    if (!t.video_url) missing.push('video')
    if (!t.release_year) missing.push('data')
    // Instrumental dainos lyrics nereikalingos pagal default'ą.
    if (!t.lyrics && t.type !== 'instrumental') missing.push('lyrics')
    tracks.push({
      id: t.id,
      title: t.title || '',
      type: t.type || 'normal',
      complete: missing.length === 0,
      missing,
      likes_count: 0,
      comments_count: 0,
    })
    trackIdList.push(t.id)
  }

  // Per-track likes + comments counts — batch'iname dvejomis user'iams matomais
  // mėtomis (likes per `likes` entity_type='track', comments per `comments`
  // track_id FK). Naudojame .in() per visus ID + group'inam client-side.
  if (trackIdList.length > 0) {
    const [trackLikesResp, trackCommentsResp] = await Promise.all([
      sb.from('likes')
        .select('entity_id')
        .eq('entity_type', 'track')
        .in('entity_id', trackIdList),
      sb.from('comments')
        .select('track_id')
        .in('track_id', trackIdList)
        .eq('is_deleted', false),
    ])
    const likesByTrack: Record<number, number> = {}
    for (const r of (trackLikesResp.data || []) as any[]) {
      likesByTrack[r.entity_id] = (likesByTrack[r.entity_id] || 0) + 1
    }
    const commentsByTrack: Record<number, number> = {}
    for (const r of (trackCommentsResp.data || []) as any[]) {
      commentsByTrack[r.track_id] = (commentsByTrack[r.track_id] || 0) + 1
    }
    for (const tc of tracks) {
      tc.likes_count = likesByTrack[tc.id] || 0
      tc.comments_count = commentsByTrack[tc.id] || 0
    }
  }

  // Current type flags — frontend rodys diff'ą su Wiki import'u
  const TYPE_KEYS = ['studio','compilation','ep','single','live','remix','covers','holiday','soundtrack','demo']
  const current_types = TYPE_KEYS.filter(k => (album as any)[`type_${k}`] === true)

  const has_cover = !!album.cover_image_url
  const has_year = !!album.year
  const substyles_count = (subRows || []).length
  const tracks_count = tracks.length
  const all_tracks_complete = tracks_count > 0 && tracks.every(t => t.complete)
  const fully_complete = has_cover && has_year && substyles_count > 0 && all_tracks_complete

  return {
    has_cover,
    has_year,
    has_full_date: !!(album.year && album.month && album.day),
    has_peak: album.peak_chart_position != null,
    has_certifications: Array.isArray(album.certifications) && album.certifications.length > 0,
    substyles_count,
    tracks_count,
    tracks,
    all_tracks_complete,
    fully_complete,
    legacy_id,
    legacy_url,
    legacy_slug,
    likes_count,
    comments_count,
    current_types,
    wiki_review_status,
  }
}
