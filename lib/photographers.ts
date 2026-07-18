/**
 * Fotografų (photographers) resolve/create helper'iai.
 *
 * Ištraukta iš app/api/artists/[id]/photos/route.ts, kad tą pačią dedup logiką
 * galėtų reuse'inti ir kiti keliai (pvz. news inbox'o Wikimedia → atlikėjo
 * profilio nuotraukų pridėjimas). Priima Supabase klientą argumentu (nėra
 * module-level singleton'o), kad veiktų su bet kokiu admin/anon klientu.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Ištraukia fotografą + licenciją iš „author" string'o:
 *    - "Brianhphoto · CC BY-SA 4.0"
 *    - "Brianhphoto - CC BY-SA 4.0"
 *    - "Jonas Petraitis" (be licencijos) */
export function splitAuthorLicense(raw: string): { name: string; license: string | null } {
  if (!raw) return { name: '', license: null }
  const m = raw.match(/^(.+?)\s*[·•|]\s*(.+)$/) || raw.match(/^(.+?)\s+-\s+(.+)$/)
  if (m) return { name: m[1].trim(), license: m[2].trim() }
  return { name: raw.trim(), license: null }
}

export function slugifyPhotographer(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'fotografas'
}

/** Grąžina egzistuojančio fotografo id (case-insensitive vardas → wikimedia
 *  external_url → naujas įrašas). */
export async function resolvePhotographerId(
  supabase: SupabaseClient,
  name: string,
  sourceUrl: string | null,
): Promise<number | null> {
  const n = name.trim()
  if (!n) return null

  const { data: byName } = await supabase
    .from('photographers')
    .select('id')
    .ilike('name', n)
    .limit(1)
  if (byName && byName[0]) return (byName[0] as any).id as number

  let source: string | null = null
  let externalUrl: string | null = null
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname
      if (host.includes('wikimedia.org') || host.includes('wikipedia.org')) {
        source = 'wikimedia'
        externalUrl = `https://commons.wikimedia.org/wiki/User:${encodeURIComponent(n)}`
      } else if (host.includes('flickr')) {
        source = 'flickr'
      } else {
        source = 'direct'
      }
    } catch {}
  }

  if (externalUrl) {
    const { data: byUrl } = await supabase
      .from('photographers')
      .select('id')
      .eq('external_url', externalUrl)
      .limit(1)
    if (byUrl && byUrl[0]) return (byUrl[0] as any).id as number
  }

  const base = slugifyPhotographer(n)
  let slug = base
  for (let i = 2; i < 20; i++) {
    const { data: clash } = await supabase
      .from('photographers')
      .select('id')
      .eq('slug', slug)
      .limit(1)
    if (!clash || clash.length === 0) break
    slug = `${base}-${i}`
  }

  const { data: inserted, error } = await supabase
    .from('photographers')
    .insert({ name: n, slug, source, external_url: externalUrl })
    .select('id')
    .single()
  if (error) {
    console.error('[photographers] insert failed:', error.message)
    return null
  }
  return inserted?.id ?? null
}
