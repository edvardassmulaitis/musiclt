import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ArtistRow = {
  id?: number
  slug: string
  name: string
  country?: string
  type: 'group' | 'solo'
  type_music: boolean
  type_film: boolean
  type_dance: boolean
  type_books: boolean
  active_from?: number
  active_until?: number
  description?: string
  spotify_id?: string
  youtube_channel_id?: string
  cover_image_url?: string
  website?: string
  subdomain?: string
  gender?: string
  birth_date?: string
  death_date?: string
  is_verified?: boolean
}

export type ArtistFull = ArtistRow & {
  genres: number[]
  links: Record<string, string>
  photos: { url: string; caption: string; sort_order: number }[]
  related: { id: number; name: string; yearFrom: string; yearTo: string }[]
  breaks: { from: string; to: string }[]
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ąčęėįšųūž]/g, c => ({ ą:'a',č:'c',ę:'e',ė:'e',į:'i',š:'s',ų:'u',ū:'u',ž:'z' }[c] || c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function getArtists(limit = 50, offset = 0, search = '') {
  let q = supabase
    .from('artists')
    .select('id, slug, name, country, type, active_from, active_until, cover_image_url, is_verified', { count: 'exact' })
    .order('name')
    .range(offset, offset + limit - 1)

  if (search) q = q.ilike('name', `%${search}%`)

  const { data, count, error } = await q
  if (error) throw error
  return { artists: data || [], total: count || 0 }
}

export async function getArtistById(id: number): Promise<ArtistFull | null> {
  const { data: artist, error } = await supabase
    .from('artists')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !artist) return null

  const [{ data: genreRows }, { data: linkRows }, { data: photoRows }, { data: breakRows }, { data: relatedRows }] =
    await Promise.all([
      supabase.from('artist_genres').select('genre_id').eq('artist_id', id),
      supabase.from('artist_links').select('platform, url').eq('artist_id', id),
      supabase.from('artist_photos').select('url, caption, sort_order').eq('artist_id', id).order('sort_order'),
      supabase.from('artist_breaks').select('year_from, year_until').eq('artist_id', id),
      supabase.from('artist_related').select('related_artist_id, year_from, year_until, artists!artist_related_related_artist_id_fkey(id, name, type)').eq('artist_id', id),
    ])

  return {
    ...artist,
    genres: (genreRows || []).map((r: any) => r.genre_id),
    links: Object.fromEntries((linkRows || []).map((r: any) => [r.platform, r.url])),
    photos: photoRows || [],
    breaks: (breakRows || []).map((r: any) => ({ from: String(r.year_from || ''), to: String(r.year_until || '') })),
    related: (relatedRows || []).map((r: any) => ({ id: r.related_artist_id, name: r.artists?.name || '', type: r.artists?.type || 'solo', yearFrom: r.year_from ? String(r.year_from) : '', yearTo: r.year_until ? String(r.year_until) : '' })),
  }
}

export async function createArtist(data: ArtistFull): Promise<number> {
  const slug = slugify(data.name)

  const { data: row, error } = await supabase
    .from('artists')
    .insert({
      slug,
      name: data.name,
      country: data.country,
      type: data.type,
      type_music: data.type_music ?? true,
      type_film: data.type_film ?? false,
      type_dance: data.type_dance ?? false,
      type_books: data.type_books ?? false,
      active_from: data.active_from || null,
      active_until: data.active_until || null,
      description: data.description,
      spotify_id: data.spotify_id,
      youtube_channel_id: data.youtube_channel_id,
      cover_image_url: data.cover_image_url,
      website: data.website,
      subdomain: data.subdomain,
      gender: data.gender,
      birth_date: data.birth_date || null,
      death_date: data.death_date || null,
    })
    .select('id')
    .single()

  if (error) throw error
  const id = row.id
  await syncRelations(id, data)
  return id
}

export async function updateArtist(id: number, data: ArtistFull): Promise<void> {
  const { error } = await supabase
    .from('artists')
    .update({
      name: data.name,
      country: data.country,
      type: data.type,
      type_music: data.type_music ?? true,
      type_film: data.type_film ?? false,
      type_dance: data.type_dance ?? false,
      type_books: data.type_books ?? false,
      active_from: data.active_from || null,
      active_until: data.active_until || null,
      description: data.description,
      spotify_id: data.spotify_id,
      youtube_channel_id: data.youtube_channel_id,
      cover_image_url: data.cover_image_url,
      website: data.website,
      subdomain: data.subdomain,
      gender: data.gender,
      birth_date: data.birth_date || null,
      death_date: data.death_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
  await syncRelations(id, data)
}

export async function deleteArtist(id: number): Promise<void> {
  const { error } = await supabase.from('artists').delete().eq('id', id)
  if (error) throw error
}

async function syncRelations(id: number, data: ArtistFull) {
  await Promise.all([
    supabase.from('artist_genres').delete().eq('artist_id', id),
    supabase.from('artist_links').delete().eq('artist_id', id),
    supabase.from('artist_photos').delete().eq('artist_id', id),
    supabase.from('artist_breaks').delete().eq('artist_id', id),
    supabase.from('artist_related').delete().eq('artist_id', id),
    supabase.from('artist_related').delete().eq('related_artist_id', id),
  ])

  const inserts: any[] = []

  if (data.genres?.length) {
    inserts.push(supabase.from('artist_genres').insert(
      data.genres.map(genre_id => ({ artist_id: id, genre_id }))
    ).then())
  }

  const linkPlatforms = ['facebook','instagram','youtube','tiktok','spotify','soundcloud','bandcamp','twitter']
  const linkRows = linkPlatforms
    .filter(p => data.links?.[p])
    .map(p => ({ artist_id: id, platform: p, url: data.links[p] }))
  if (linkRows.length) {
    inserts.push(supabase.from('artist_links').insert(linkRows).then())
  }

  if (data.photos?.length) {
    inserts.push(supabase.from('artist_photos').insert(
      data.photos.map((p, i) => ({ artist_id: id, url: p.url, caption: p.caption, sort_order: i }))
    ).then())
  }

  if (data.breaks?.length) {
    inserts.push(supabase.from('artist_breaks').insert(
      data.breaks
        .filter(b => b.from)
        .map(b => ({ artist_id: id, year_from: parseInt(b.from), year_until: b.to ? parseInt(b.to) : null }))
    ).then())
  }

  if (data.related?.length) {
    // Insert both directions: A→B and B→A
    const relRows = data.related.flatMap(r => [
      { artist_id: id, related_artist_id: r.id, year_from: r.yearFrom ? parseInt(r.yearFrom) : null, year_until: r.yearTo ? parseInt(r.yearTo) : null },
      { artist_id: r.id, related_artist_id: id, year_from: r.yearFrom ? parseInt(r.yearFrom) : null, year_until: r.yearTo ? parseInt(r.yearTo) : null },
    ])
    inserts.push(supabase.from('artist_related').upsert(relRows, { onConflict: 'artist_id,related_artist_id' }).then())
  }

  await Promise.all(inserts)
}
