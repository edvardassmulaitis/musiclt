// Featuring artist utilities — shared tarp lib/supabase-albums.ts ir Wiki
// enrich endpoint'o. Užtikrina, kad featuring artists tinkamai linkint'i
// (jei jau egzistuoja DB) arba sukurti naujai (jei dar nėra).

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugify } from './slugify'

/** Iš raw Wiki artist name'o pašalina paren'uose esančius type-tags
 *  ("(singer)", "(rapper)", "(British)" etc.), kurie kartais lieka po
 *  Wiki link parse'inimo. */
export function cleanArtistName(raw: string): string {
  return (raw || '')
    .replace(/\s*\(\s*(?:singer|rapper|musician|entertainer|DJ|band|group|American|British|record producer|songwriter|actor|actress|performer|vocalist|artist|composer|producer)\s*\)/gi, '')
    .replace(/_/g, ' ')
    .trim()
}

/** Suranda artist'ą pagal slug arba ilike name. Jei neranda — sukuria
 *  naują solo įrašą su `source='wikipedia'` ir grąžina ID. */
export async function findOrCreateArtist(sb: SupabaseClient, name: string): Promise<number | null> {
  const cleanName = cleanArtistName(name)
  if (!cleanName || cleanName.length < 2) return null
  const slug = slugify(cleanName)
  const { data: existing } = await sb
    .from('artists').select('id').eq('slug', slug).maybeSingle()
  if (existing) return (existing as any).id
  // Backup: ilike name match — slugify gali differ jei DB turi senesnį slug
  const { data: byName } = await sb
    .from('artists').select('id').ilike('name', cleanName).maybeSingle()
  if (byName) return (byName as any).id
  const { data: newArtist, error } = await sb.from('artists').insert({
    name: cleanName,
    slug,
    type: 'solo',
    source: 'wikipedia',
  }).select('id').single()
  if (error) {
    console.warn('[findOrCreateArtist] insert failed:', cleanName, error.message)
    return null
  }
  return (newArtist as any)?.id || null
}

/** UNION sync — pridedam Wiki featuring artists prie track_artists JOIN'o,
 *  neperrašom esamų. Returns count of NEW links added.
 *
 *  Saugu: niekada netrina existing featuring (gali būti music.lt admin
 *  manual'ai sukurtas link'as).
 */
export async function syncTrackFeaturing(
  sb: SupabaseClient,
  trackId: number,
  names: string[]
): Promise<number> {
  if (!names || !names.length) return 0
  const clean = names.map(n => cleanArtistName(n)).filter(n => n.length >= 2)
  if (!clean.length) return 0

  // Esamos non-primary featuring artist IDs
  const { data: existing } = await sb
    .from('track_artists')
    .select('artist_id')
    .eq('track_id', trackId)
  const existingSet = new Set<number>((existing || []).map((r: any) => r.artist_id))

  let added = 0
  for (const name of clean) {
    const aid = await findOrCreateArtist(sb, name)
    if (!aid || existingSet.has(aid)) continue
    const { error } = await sb.from('track_artists').insert({
      track_id: trackId,
      artist_id: aid,
      is_primary: false,
    })
    if (!error) {
      added++
      existingSet.add(aid)
    } else {
      console.warn('[syncTrackFeaturing] link insert failed:', name, error.message)
    }
  }
  return added
}
