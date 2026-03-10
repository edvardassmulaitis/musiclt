/**
 * POST /api/artists/import
 *
 * Programmatic artist creation + Wikipedia import in one call.
 * Designed for Claude Cowork automation flow:
 *
 *   1. Claude finds a new song/artist online
 *   2. Checks if artist exists: GET /api/artists?search=Name&exact=1
 *   3. If not found → POST /api/artists/import  ← THIS ENDPOINT
 *   4. Gets back artist_id → adds songs, creates news item
 *
 * Request body:
 * {
 *   name: string            // required — artist name
 *   wiki_url?: string       // Wikipedia URL (lt or en)
 *   wiki_title?: string     // Wikipedia page title (alternative to url)
 *   type?: 'group'|'solo'   // default: 'group'
 *   country?: string        // default: 'Lietuva'
 *   genre?: string          // default: 'Kitų stilių muzika'
 *   import_discography?: boolean  // default: false
 *   dry_run?: boolean        // default: false — if true, only returns what would be imported
 * }
 *
 * Response:
 * {
 *   artist_id: number
 *   slug: string
 *   name: string
 *   created: boolean        // false if artist already existed
 *   wiki_imported: boolean
 *   discography_imported: boolean
 *   url: string             // public profile URL
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

const GENRE_IDS: Record<string, number> = {
  'Alternatyvioji muzika': 1000001,
  'Elektroninė, šokių muzika': 1000002,
  "Hip-hop'o muzika": 1000003,
  'Kitų stilių muzika': 1000004,
  'Pop, R&B muzika': 1000005,
  'Rimtoji muzika': 1000006,
  'Roko muzika': 1000007,
  'Sunkioji muzika': 1000008,
}

// ── Slugify ──────────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ąä]/g, 'a').replace(/[čç]/g, 'c').replace(/[ęè]/g, 'e')
    .replace(/[ėé]/g, 'e').replace(/[į]/g, 'i').replace(/[š]/g, 's')
    .replace(/[ų]/g, 'u').replace(/[ū]/g, 'u').replace(/[ž]/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── Fetch Wikipedia data (same logic as WikipediaImport component) ────────────
async function fetchWikiData(wikiUrl: string): Promise<Record<string, any> | null> {
  try {
    // Determine language from URL
    const isLt = wikiUrl.includes('lt.wikipedia.org')
    const lang = isLt ? 'lt' : 'en'
    const title = decodeURIComponent(wikiUrl.split('/wiki/')[1]?.replace(/_/g, ' ') || '')
    if (!title) return null

    const apiUrl = `https://${lang}.wikipedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(title)}&prop=revisions|pageimages|extracts` +
      `&rvprop=content&rvslots=main&piprop=thumbnail&pithumbsize=800` +
      `&exintro=true&explaintext=true&format=json&origin=*`

    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'music.lt/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages || {}
    const page = Object.values(pages)[0] as any
    if (!page || page.missing) return null

    return {
      title: page.title,
      thumbnail: page.thumbnail?.source || null,
      extract: page.extract || '',
      content: page.revisions?.[0]?.slots?.main?.['*'] || '',
      lang,
    }
  } catch {
    return null
  }
}

// ── Parse basic info from Wikipedia infobox ──────────────────────────────────
function parseWikibasics(wikiData: Record<string, any>): Partial<Record<string, any>> {
  const content: string = wikiData.content || ''
  const result: Record<string, any> = {}

  // Type detection
  const lower = content.toLowerCase()
  if (lower.includes('solo_singer') || lower.includes('birth_name') || lower.includes('born =')) {
    result.type = 'solo'
  } else {
    result.type = 'group'
  }

  // Country
  const originMatch = content.match(/\|\s*origin\s*=\s*([^\n|]+)/i)
  if (originMatch) {
    const origin = originMatch[1].replace(/\[\[|\]\]/g, '').replace(/\|[^\]]+/g, '').trim()
    if (origin.toLowerCase().includes('lietuv') || origin.toLowerCase().includes('lithuani')) {
      result.country = 'Lietuva'
    } else if (origin.toLowerCase().includes('latvij') || origin.toLowerCase().includes('latvia')) {
      result.country = 'Latvija'
    }
  }

  // Years active
  const fromMatch = content.match(/\|\s*years_active\s*=\s*(\d{4})/i)
  if (fromMatch) result.yearStart = fromMatch[1]

  // Birth date (solo)
  const birthMatch = content.match(/birth_date[^=]*=\s*[^|]*?(\d{4})[^|]*?(\d{1,2})?[^|]*?(\d{1,2})?/i)
  if (birthMatch) {
    result.birthYear = birthMatch[1]
    if (birthMatch[2]) result.birthMonth = birthMatch[2]
    if (birthMatch[3]) result.birthDay = birthMatch[3]
  }

  // Avatar from thumbnail
  if (wikiData.thumbnail) result.avatar = wikiData.thumbnail

  // Description from extract (first 2 sentences)
  if (wikiData.extract) {
    const sentences = wikiData.extract.split(/[.!?]/).filter(Boolean).slice(0, 2)
    result.description = sentences.join('. ').trim() + '.'
  }

  return result
}

// ── Check if artist already exists ──────────────────────────────────────────
async function findExistingArtist(supabase: any, name: string): Promise<{ id: number; slug: string } | null> {
  const { data } = await supabase
    .from('artists')
    .select('id, slug')
    .ilike('name', name.trim())
    .limit(1)
    .single()
  return data || null
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      name,
      wiki_url,
      wiki_title,
      type = 'group',
      country = 'Lietuva',
      genre = 'Kitų stilių muzika',
      import_discography = false,
      dry_run = false,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // ── 1. Check if already exists ────────────────────────────────────────
    const existing = await findExistingArtist(supabase, name)
    if (existing) {
      return NextResponse.json({
        artist_id: existing.id,
        slug: existing.slug,
        name: name.trim(),
        created: false,
        wiki_imported: false,
        discography_imported: false,
        url: `/atlikejai/${existing.slug}`,
        message: 'Artist already exists',
      })
    }

    // ── 2. Resolve wiki URL ───────────────────────────────────────────────
    let resolvedWikiUrl = wiki_url || null
    if (!resolvedWikiUrl && wiki_title) {
      resolvedWikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki_title.replace(/ /g, '_'))}`
    }

    // ── 3. Fetch wiki data ────────────────────────────────────────────────
    let wikiData: Record<string, any> | null = null
    let parsedWiki: Partial<Record<string, any>> = {}

    if (resolvedWikiUrl) {
      wikiData = await fetchWikiData(resolvedWikiUrl)
      if (wikiData) {
        parsedWiki = parseWikibasics(wikiData)
      }
    }

    // ── 4. Build artist payload ───────────────────────────────────────────
    const genreId = GENRE_IDS[genre] || GENRE_IDS['Kitų stilių muzika']
    // birth_date / death_date as ISO strings if parsed
    const birthDate = parsedWiki.birthYear
      ? `${parsedWiki.birthYear}-${String(parsedWiki.birthMonth || 1).padStart(2, '0')}-${String(parsedWiki.birthDay || 1).padStart(2, '0')}`
      : null
    const artistPayload = {
      name:            name.trim(),
      slug:            slugify(name.trim()),
      type:            parsedWiki.type    || type,
      country:         parsedWiki.country || country,
      type_music:      true,
      type_film:       false,
      type_dance:      false,
      type_books:      false,
      active_from:     parsedWiki.yearStart ? parseInt(parsedWiki.yearStart) : null,
      description:     parsedWiki.description || null,
      cover_image_url: parsedWiki.avatar || null,
      gender:          parsedWiki.gender || null,
      birth_date:      birthDate,
      is_active:       true,
      is_verified:     false,
      photos:          [],
      // wiki_url not in DB schema — stored in response only
    }

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        would_create: artistPayload,
        wiki_found: !!wikiData,
        wiki_url: resolvedWikiUrl,
      })
    }

    // ── 5. Insert artist ──────────────────────────────────────────────────
    // Handle duplicate slug
    let slug = artistPayload.slug
    const { data: slugCheck } = await supabase
      .from('artists')
      .select('id')
      .eq('slug', slug)
      .limit(1)
      .single()
    if (slugCheck) slug = `${slug}-${Date.now().toString(36)}`

    const { data: newArtist, error: insertError } = await supabase
      .from('artists')
      .insert({ ...artistPayload, slug })
      .select('id, slug')
      .single()

    if (insertError || !newArtist) {
      return NextResponse.json({ error: insertError?.message || 'Insert failed' }, { status: 500 })
    }

    // ── 6. Link genre ─────────────────────────────────────────────────────
    if (genreId) {
      try {
        await supabase.from('artist_genres').insert({
          artist_id: newArtist.id,
          genre_id: genreId,
        })
      } catch {}
    }

    // ── 7. Trigger internal wiki import (full) via internal API ──────────
    // This re-uses the existing /api/wiki-import endpoint if it exists,
    // otherwise the basic data above is sufficient for Cowork to proceed.
    let wikiImported = !!wikiData
    if (wikiData && resolvedWikiUrl) {
      try {
        const importRes = await fetch(
          `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/wiki-import`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistId: newArtist.id,
              wikiUrl: resolvedWikiUrl,
              overwrite: true,
            }),
          }
        )
        if (!importRes.ok) wikiImported = false
      } catch {
        // Not critical — basic data already inserted
      }
    }

    return NextResponse.json({
      artist_id: newArtist.id,
      slug: newArtist.slug,
      name: name.trim(),
      created: true,
      wiki_imported: wikiImported,
      discography_imported: false, // Discography is a separate endpoint
      url: `/atlikejai/${newArtist.slug}`,
      // Cowork can use these to trigger discography import separately:
      wiki_url: resolvedWikiUrl,
      wiki_title: wikiData?.title || wiki_title || null,
    })

  } catch (e: any) {
    console.error('[/api/artists/import]', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/**
 * GET /api/artists/import?name=Skamp
 * Quick existence check — used by Cowork before importing
 */
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = createAdminClient()
  const existing = await findExistingArtist(supabase, name)

  return NextResponse.json({
    exists: !!existing,
    artist_id: existing?.id || null,
    slug: existing?.slug || null,
    url: existing ? `/atlikejai/${existing.slug}` : null,
  })
}
