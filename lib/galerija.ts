// lib/galerija.ts
//
// SERVER data sluoksnis foto galerijai (/galerija). Visi fetch'ai server-side,
// react-cache'inami, try/catch degrade — kaip lib/concert-recordings.ts.
// Klientui saugūs tipai/helper'iai → lib/galerija-shared.ts.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import { proxyImgResized } from '@/lib/img-proxy'
import type { Reportage, ReportagePhoto, Photographer, LineupArtist, PhotoGroup } from '@/lib/galerija-shared'
import { reportageHref, photographerHref, photoGroup, buildPhotoGroups } from '@/lib/galerija-shared'

export type { Reportage, ReportagePhoto, Photographer, LineupArtist, PhotoGroup } from '@/lib/galerija-shared'
export {
  reportageHref, photographerHref, formatEventDate, reportagePlaceLine,
  flickrPhotoUrl, parseFlickrAlbumId, buildPhotoGroups,
} from '@/lib/galerija-shared'

const REPORTAGE_COLS =
  'id, slug, title, intro, artist_id, photographer_id, event_name, venue, city, ' +
  'event_date, cover_url, photo_count, is_featured, published_at, flickr_album_url, source_url, ' +
  'artists:artist_id(name, slug), photographers:photographer_id(name, slug)'

function mapReportage(r: any): Reportage {
  const a = r.artists || null
  const p = r.photographers || null
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
  return {
    id: r.id,
    url: r.url,
    thumbUrl: r.thumb_url ? proxyImgResized(r.thumb_url, 500) : proxyImgResized(r.url, 500),
    caption: r.caption ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    artistId,
    artistName,
    tag,
    groupKey: g.key,
    groupLabel: g.label,
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
    .select('artist_id, role, sort_order, artists:artist_id(name, slug)')
    .eq('reportage_id', reportageId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
  return ((data || []) as any[]).map((r) => ({
    id: r.artist_id,
    name: r.artists?.name ?? 'Atlikėjas',
    slug: r.artists?.slug ?? null,
    role: r.role ?? null,
  }))
}

/** Vienas reportažas pagal slug + nuotraukos + line-up + grupės. */
export const getReportageBySlug = cache(
  async (slug: string): Promise<{ reportage: Reportage; photos: ReportagePhoto[]; lineup: LineupArtist[]; groups: PhotoGroup[] } | null> => {
    try {
      const sb = createAdminClient()
      const { data } = await sb
        .from('reportages')
        .select(REPORTAGE_COLS)
        .eq('slug', slug)
        .maybeSingle()
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
      return { reportage, photos, lineup, groups }
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
