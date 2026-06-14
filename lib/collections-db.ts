// lib/collections-db.ts
//
// Kolekcijų definicijų DB skaitymo sluoksnis. Šaltinis = `collections` lentelė
// (valdoma per /admin/kolekcijos). lib/collections.ts arrays lieka kaip
// TIPAI + SEED + FALLBACK — jei DB nepasiekiama (build-time / klaida), grąžinam
// hardcoded sąrašą, kad puslapiai niekada nebūtų tušti.
//
// Visi skaitymai server-side, react cache (dedupe per render) + try/catch.

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase'
import {
  SONG_COLLECTIONS, ALBUM_COLLECTIONS,
  type SongCollection, type AlbumCollection,
} from '@/lib/collections'

type Row = {
  slug: string
  kind: 'song' | 'album'
  title: string
  emoji: string | null
  meta_title: string | null
  description: string | null
  intro: string | null
  grp: string | null
  genre_name: string | null
  scope: string | null
  substyle_slug: string | null
  sort: number | null
  is_active: boolean | null
}

function toSong(r: Row): SongCollection {
  return {
    slug: r.slug,
    title: r.title,
    emoji: r.emoji || '🎵',
    metaTitle: r.meta_title || r.title,
    description: r.description || '',
    intro: r.intro || '',
    group: r.grp === 'nuotaika' ? 'nuotaika' : 'tema',
  }
}

function toAlbum(r: Row): AlbumCollection {
  return {
    slug: r.slug,
    title: r.title,
    emoji: r.emoji || '💿',
    metaTitle: r.meta_title || r.title,
    description: r.description || '',
    intro: r.intro || '',
    genreName: r.genre_name || undefined,
    scope: (r.scope as AlbumCollection['scope']) || undefined,
    substyleSlug: r.substyle_slug || undefined,
  }
}

/** Visos aktyvios DAINŲ kolekcijos (sort tvarka). DB → fallback array. */
export const getSongCollections = cache(async (): Promise<SongCollection[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('collections')
      .select('slug, kind, title, emoji, meta_title, description, intro, grp, genre_name, scope, substyle_slug, sort, is_active')
      .eq('kind', 'song')
      .eq('is_active', true)
      .order('sort', { ascending: true })
    const rows = (data || []) as Row[]
    if (rows.length === 0) return SONG_COLLECTIONS
    return rows.map(toSong)
  } catch {
    return SONG_COLLECTIONS
  }
})

/** Visos aktyvios ALBUMŲ kolekcijos (sort tvarka). DB → fallback array. */
export const getAlbumCollections = cache(async (): Promise<AlbumCollection[]> => {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('collections')
      .select('slug, kind, title, emoji, meta_title, description, intro, grp, genre_name, scope, substyle_slug, sort, is_active')
      .eq('kind', 'album')
      .eq('is_active', true)
      .order('sort', { ascending: true })
    const rows = (data || []) as Row[]
    if (rows.length === 0) return ALBUM_COLLECTIONS
    return rows.map(toAlbum)
  } catch {
    return ALBUM_COLLECTIONS
  }
})

export async function findSongCollection(slug: string): Promise<SongCollection | null> {
  const all = await getSongCollections()
  return all.find((c) => c.slug === slug) || null
}

export async function findAlbumCollection(slug: string): Promise<AlbumCollection | null> {
  const all = await getAlbumCollections()
  return all.find((c) => c.slug === slug) || null
}

export async function isSongCollectionSlug(slug: string): Promise<boolean> {
  const all = await getSongCollections()
  return all.some((c) => c.slug === slug)
}
