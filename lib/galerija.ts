// lib/galerija.ts
//
// SERVER data sluoksnis foto galerijai (/galerija). Visi fetch'ai server-side,
// react-cache'inami, try/catch degrade — kaip lib/concert-recordings.ts.
// Klientui saugūs tipai/helper'iai → lib/galerija-shared.ts.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { proxyImgResized } from '@/lib/img-proxy'
import { getYouTubeId } from '@/lib/radaras-shared'
import type { Reportage, ReportagePhoto, Photographer, LineupArtist, PhotoGroup } from '@/lib/galerija-shared'

export type PlaylistItem = {
  id: number; title: string; artistName: string; artistSlug: string | null
  videoId: string; thumb: string; href: string; isMain: boolean
}
import { reportageHref, photographerHref, photoGroup, buildPhotoGroups } from '@/lib/galerija-shared'

export type { Reportage, ReportagePhoto, Photographer, LineupArtist, PhotoGroup } from '@/lib/galerija-shared'
export {
  reportageHref, photographerHref, formatEventDate, reportagePlaceLine,
  flickrPhotoUrl, parseFlickrAlbumId, buildPhotoGroups, ltCount,
} from '@/lib/galerija-shared'

const REPORTAGE_COLS =
  'id, slug, title, intro, artist_id, photographer_id, author_id, event_name, venue, city, ' +
  'event_date, cover_url, photo_count, is_featured, published_at, flickr_album_url, source_url, blog_post_id, ' +
  'artists:artist_id(name, slug), ' +
  'photographers:photographer_id(name, slug, profiles:profile_id(username)), ' +
  'author:author_id(name, slug, profiles:profile_id(username))'

function mapReportage(r: any): Reportage {
  const a = r.artists || null
  const p = r.photographers || null
  const au = r.author || null
  return {
    id: r.id,
    slug: r.slug,
    href: reportageHref(r.slug),
    title: r.title,
    intro: r.intro ?? null,
    artistId: r.artist_id ?? null,
    artistName: a?.name ?? null,
    artistSlug: a?.slug ?? null,
    photographerId: r.photographer_id ?? null,
    photographerName: p?.name ?? null,
    photographerSlug: p?.slug ?? null,
    photographerUsername: p?.profiles?.username ?? null,
    authorName: au?.name ?? null,
    authorSlug: au?.slug ?? null,
    authorUsername: au?.profiles?.username ?? null,
    eventName: r.event_name ?? null,
    venue: r.venue ?? null,
    city: r.city ?? null,
    eventDate: r.event_date ?? null,
    coverUrl: r.cover_url ? proxyImgResized(r.cover_url, 800) : null,
    photoCount: r.photo_count ?? 0,
    isFeatured: !!r.is_featured,
    publishedAt: r.published_at ?? null,
    flickrAlbumUrl: r.flickr_album_url ?? null,
    sourceUrl: r.source_url ?? null,
  }
}

function mapPhoto(r: any): ReportagePhoto {
  const artistId = r.artist_id ?? null
  const artistName = r.artists?.name ?? null
  const tag = r.tag ?? null
  const g = photoGroup({ artistId, artistName, tag })
  const w = r.width ?? null
  const h = r.height ?? null
  return {
    id: r.id,
    url: r.url,
    thumbUrl: r.thumb_url ? proxyImgResized(r.thumb_url, 700) : proxyImgResized(r.url, 700),
    caption: r.caption ?? null,
    width: w,
    height: h,
    artistId,
    artistName,
    tag,
    groupKey: g.key,
    groupLabel: g.label,
    aspectRatio: w && h ? w / h : 1.5,
  }
}

/* ─────────────────────────── Reportažai ─────────────────────────── */

/** Naujausi publikuoti reportažai (hub listing). Featured pirmi. */
export const getLatestReportages = cache(async (limit = 60): Promise<Reportage[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('reportages')
      .select(REPORTAGE_COLS)
      .eq('is_published', true)
      .order('is_featured', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapReportage)
  } catch { return [] }
})

/** Reportažo line-up — atlikėjai su vaidmenimis (sort_order tvarka). */
async function loadLineup(sb: ReturnType<typeof createAdminClient>, reportageId: number): Promise<LineupArtist[]> {
  const { data } = await sb
    .from('reportage_artists')
    .select('artist_id, role, sort_order, artists:artist_id(name, slug, cover_image_url)')
    .eq('reportage_id', reportageId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  return ((data || []) as any[]).map((r) => ({
    id: r.artist_id,
    name: r.artists?.name ?? 'Atlikėjas',
    slug: r.artists?.slug ?? null,
    role: r.role ?? null,
    image: r.artists?.cover_image_url ? proxyImgResized(r.artists.cover_image_url, 200) : null,
  }))
}

/** Grotuvas galerijos šonui — pagrindinio atlikėjo top dainos + po 1 iš
 *  papildomų (line-up tvarka). Tik dainos su YouTube video. */
export const getReportagePlaylist = cache(async (lineup: LineupArtist[]): Promise<PlaylistItem[]> => {
  try {
    if (!lineup.length) return []
    const sb = createAdminClient()
    const out: PlaylistItem[] = []
    const seen = new Set<number>()
    for (let i = 0; i < lineup.length && out.length < 12; i++) {
      const a = lineup[i]
      const take = i === 0 ? 6 : 2
      const { data } = await sb
        .from('tracks')
        .select('id, slug, title, video_url, artists:artist_id(name, slug)')
        .eq('artist_id', a.id)
        .not('video_url', 'is', null)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(take * 4)
      let added = 0
      for (const t of ((data || []) as any[])) {
        if (added >= take) break
        const vid = getYouTubeId(t.video_url)
        if (!vid || seen.has(t.id)) continue
        seen.add(t.id)
        const aSlug = t.artists?.slug ?? a.slug
        out.push({
          id: t.id, title: t.title, artistName: t.artists?.name ?? a.name, artistSlug: aSlug,
          videoId: vid, thumb: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
          href: aSlug ? `/dainos/${aSlug}-${t.slug}-${t.id}` : `/dainos/${t.slug}-${t.id}`,
          isMain: i === 0,
        })
        added++
      }
    }
    return out
  } catch { return [] }
})

/** Kiti to paties fotografo reportažai (be dabartinio) — „Daugiau šio fotografo". */
export const getMoreByPhotographer = cache(
  async (photographerId: number, excludeId: number, limit = 8): Promise<Reportage[]> => {
    try {
      const sb = createAdminClient()
      const { data } = await sb
        .from('reportages')
        .select(REPORTAGE_COLS)
        .eq('photographer_id', photographerId)
        .eq('is_published', true)
        .neq('id', excludeId)
        .order('published_at', { ascending: false })
        .limit(limit)
      return ((data || []) as any[]).map(mapReportage)
    } catch { return [] }
  }
)

/** Vienas reportažas pagal slug + nuotraukos + line-up + grupės. */
export type ReviewPostLink = { blogSlug: string; slug: string; title: string | null }

export const getReportageBySlug = cache(
  async (slug: string): Promise<{ reportage: Reportage; photos: ReportagePhoto[]; lineup: LineupArtist[]; groups: PhotoGroup[]; reviewPost: ReviewPostLink | null } | null> => {
    try {
      const sb = createAdminClient()
      let { data } = await sb
        .from('reportages')
        .select(REPORTAGE_COLS)
        .eq('slug', slug)
        .maybeSingle()
      // Senas slug'as (po SEO pervadinimo) → randam per old_slugs; page'as
      // 301-redirect'ins į kanoninį (reportage.slug).
      if (!data) {
        const { data: byOld } = await sb
          .from('reportages')
          .select(REPORTAGE_COLS)
          .contains('old_slugs', [slug])
          .limit(1)
          .maybeSingle()
        data = byOld
      }
      if (!data) return null
      const reportage = mapReportage(data)
      const [{ data: ph }, lineup] = await Promise.all([
        sb.from('reportage_photos')
          .select('id, url, thumb_url, caption, width, height, sort_order, artist_id, tag, artists:artist_id(name)')
          .eq('reportage_id', reportage.id)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true }),
        loadLineup(sb, reportage.id),
      ])
      const photos = ((ph || []) as any[]).map(mapPhoto)
      const lineupOrder = new Map(lineup.map((a, i) => [a.id, i]))
      const groups = buildPhotoGroups(photos, lineupOrder)

      // Thread C 3b: susietas narių recenzijos įrašas (per reportages.blog_post_id).
      // URL segmentas = blogo slug'as (žr. /blogas/[username]/[slug]).
      let reviewPost: ReviewPostLink | null = null
      const bpId = (data as any).blog_post_id
      if (bpId) {
        const { data: bp } = await sb
          .from('blog_posts')
          .select('slug, title, is_deleted, status, blogs:blog_id(slug)')
          .eq('id', bpId)
          .maybeSingle()
        const blogSlug = (bp as any)?.blogs?.slug
        if (bp && !(bp as any).is_deleted && (bp as any).status === 'published' && blogSlug && bp.slug) {
          reviewPost = { blogSlug, slug: bp.slug, title: bp.title ?? null }
        }
      }

      return { reportage, photos, lineup, groups, reviewPost }
    } catch { return null }
  }
)

/** Reportažai konkretaus atlikėjo puslapiui — visi, kuriuose jis dalyvauja (line-up). */
export const getReportagesForArtist = cache(async (artistId: number, limit = 8): Promise<Reportage[]> => {
  try {
    const sb = createAdminClient()
    // Reportažų ID iš line-up (apima ir primary, nes backfill'inta) + primary fallback.
    const { data: la } = await sb.from('reportage_artists').select('reportage_id').eq('artist_id', artistId)
    const ids = Array.from(new Set(((la || []) as any[]).map((r) => r.reportage_id)))
    const orParts = [`artist_id.eq.${artistId}`]
    if (ids.length) orParts.push(`id.in.(${ids.join(',')})`)
    const { data } = await sb
      .from('reportages')
      .select(REPORTAGE_COLS)
      .eq('is_published', true)
      .or(orParts.join(','))
      .order('published_at', { ascending: false })
      .limit(limit)
    return ((data || []) as any[]).map(mapReportage)
  } catch { return [] }
})

/** Slug'ai sitemap'ui / generateStaticParams. */
export const getAllReportageSlugs = cache(async (): Promise<string[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb.from('reportages').select('slug').eq('is_published', true).limit(1000)
    return ((data || []) as any[]).map((r) => r.slug)
  } catch { return [] }
})

/* ─────────────────────────── Fotografai ─────────────────────────── */

function mapPhotographer(r: any, reportageCount = 0, photoCount = 0): Photographer {
  return {
    id: r.id,
    slug: r.slug,
    href: photographerHref(r.slug),
    name: r.name,
    roleTitle: r.role_title ?? null,
    bio: r.bio ?? null,
    avatarUrl: r.avatar_url ? proxyImgResized(r.avatar_url, 200) : null,
    websiteUrl: r.website_url ?? null,
    instagramUrl: r.instagram_url ?? null,
    facebookUrl: r.facebook_url ?? null,
    flickrUrl: r.flickr_url ?? null,
    reportageCount,
    photoCount,
  }
}

/** Curated fotografų direktorija (su reportažų skaičiumi). */
export const getCuratedPhotographers = cache(async (): Promise<Photographer[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('photographers')
      .select('id, slug, name, role_title, bio, avatar_url, website_url, instagram_url, facebook_url, flickr_url')
      .eq('is_curated', true)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    const rows = (data || []) as any[]
    if (!rows.length) return []
    // Reportažų skaičius per fotografą (vienu query)
    const ids = rows.map((r) => r.id)
    const counts = new Map<number, number>()
    const { data: reps } = await sb
      .from('reportages')
      .select('photographer_id')
      .in('photographer_id', ids)
      .eq('is_published', true)
    for (const r of (reps || []) as any[]) {
      counts.set(r.photographer_id, (counts.get(r.photographer_id) || 0) + 1)
    }
    return rows.map((r) => mapPhotographer(r, counts.get(r.id) || 0))
  } catch { return [] }
})

/** Vienas fotografas + jo reportažai. Grąžina null jei neegzistuoja. */
export const getPhotographerBySlug = cache(
  async (slug: string): Promise<{ photographer: Photographer; reportages: Reportage[]; isCurated: boolean } | null> => {
    try {
      const sb = createAdminClient()
      const { data } = await sb
        .from('photographers')
        .select('id, slug, name, role_title, bio, avatar_url, website_url, instagram_url, facebook_url, flickr_url, external_url, source, is_curated')
        .eq('slug', slug)
        .maybeSingle()
      if (!data) return null
      const { data: reps } = await sb
        .from('reportages')
        .select(REPORTAGE_COLS)
        .eq('photographer_id', data.id)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(60)
      const reportages = ((reps || []) as any[]).map(mapReportage)
      const photographer = mapPhotographer(data, reportages.length)
      return { photographer, reportages, isCurated: !!data.is_curated }
    } catch { return null }
  }
)
