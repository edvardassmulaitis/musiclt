/**
 * POST /api/admin/awards/import?artist_id=X
 *
 * Body: {
 *   wiki_title?: string,        // override; default: "List_of_awards_and_nominations_received_by_<artist_name>"
 *   entries?: AwardEntry[],     // pre-confirmed entries (from preview modal); if omitted, fetch + parse + return preview
 * }
 *
 * Two modes:
 *   - mode=preview (no entries in body): fetches article + parses + returns entries[] WITHOUT writing
 *   - mode=commit (entries in body): writes voting_channels/editions/events/participants + creates missing tracks/albums
 *
 * Auth: admin session OR INTERNAL_API_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { COUNTRIES, SUBSTYLES } from '@/lib/constants'
import * as wikiParser from '@/lib/wiki-parser'

let _initialized = false
function ensureInitialized() {
  if (_initialized) return
  wikiParser.initializeConstants(COUNTRIES as readonly string[] as string[], SUBSTYLES)
  _initialized = true
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function authorize(req: NextRequest) {
  const sec = req.headers.get('x-internal-secret')
  if (sec && sec === process.env.INTERNAL_API_SECRET) return true
  const session = await getServerSession(authOptions)
  return !!(session?.user?.role && ['admin', 'super_admin'].includes(session.user.role))
}

async function fetchWikitext(title: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json`,
      { headers: { 'User-Agent': 'MusicLtRebuild/1.0' } }
    )
    if (!r.ok) return null
    const j = await r.json()
    return j?.parse?.wikitext?.['*'] || null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  ensureInitialized()

  const url = new URL(req.url)
  const artistId = parseInt(url.searchParams.get('artist_id') || '')
  if (!artistId) {
    return NextResponse.json({ ok: false, error: 'artist_id required' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const supabase = createAdminClient()

  // Get artist
  const { data: artist } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('id', artistId)
    .single()
  if (!artist) {
    return NextResponse.json({ ok: false, error: 'Artist not found' }, { status: 404 })
  }

  // ── Mode: preview ──────────────────────────────────────────
  // No entries → fetch + parse, return for user verification
  if (!Array.isArray(body.entries)) {
    const wikiTitle = body.wiki_title
      || `List_of_awards_and_nominations_received_by_${artist.name.replace(/ /g, '_')}`
    const wt = await fetchWikitext(wikiTitle)
    if (!wt) {
      // Try fallback page name
      const alt = `${artist.name.replace(/ /g, '_')}_awards_and_nominations`
      const wt2 = await fetchWikitext(alt)
      if (!wt2) {
        return NextResponse.json({
          ok: true,
          mode: 'preview',
          wiki_title_tried: [wikiTitle, alt],
          entries: [],
          note: 'No dedicated awards article found on Wikipedia.',
        })
      }
      const entries = wikiParser.parseAwardsArticle(wt2)
      return NextResponse.json({ ok: true, mode: 'preview', wiki_title: alt, entries })
    }
    const entries = wikiParser.parseAwardsArticle(wt)
    return NextResponse.json({ ok: true, mode: 'preview', wiki_title: wikiTitle, entries })
  }

  // ── Mode: commit ───────────────────────────────────────────
  // Insert/upsert into voting tables. Create missing tracks/albums as orphans.
  const entries: any[] = body.entries

  // Fetch existing artist's tracks + albums for matching
  const { data: existingTracks } = await supabase
    .from('tracks').select('id, title').eq('artist_id', artistId)
  const { data: existingAlbums } = await supabase
    .from('albums').select('id, title').eq('artist_id', artistId)

  const norm = (s: string) => (s || '').toLowerCase().replace(/[‘’“”'"]+/g, '').replace(/\s+/g, ' ').trim()
  const trackByTitle = new Map<string, number>()
  for (const t of (existingTracks || []) as any[]) trackByTitle.set(norm(t.title), t.id)
  const albumByTitle = new Map<string, number>()
  for (const a of (existingAlbums || []) as any[]) albumByTitle.set(norm(a.title), a.id)

  // Caches for upserts within this request
  const channelCache = new Map<string, number>()  // slug → id
  const editionCache = new Map<string, number>()  // `${chId}:${year}` → id
  const eventCache = new Map<string, number>()    // `${edId}:${slug}` → id

  const stats = {
    channels_created: 0, channels_existing: 0,
    editions_created: 0, editions_existing: 0,
    events_created: 0, events_existing: 0,
    participants_created: 0, participants_existing: 0,
    tracks_created: 0, albums_created: 0,
    skipped: 0, errors: [] as string[],
  }

  for (const entry of entries) {
    try {
      const channelName: string = entry.channel
      const channelSlug: string = entry.channelSlug || slugify(channelName)
      const year: number | null = entry.year || null
      const category: string = entry.category
      const work: string = entry.work || ''
      const workType: string = entry.workType || 'unknown'
      const result: string = entry.result || 'other'
      if (!channelName || !category || !year) { stats.skipped++; continue }

      // 1. Upsert channel
      let chId = channelCache.get(channelSlug)
      if (!chId) {
        const { data: existing } = await supabase
          .from('voting_channels').select('id').eq('slug', channelSlug).maybeSingle()
        if (existing) {
          chId = existing.id; stats.channels_existing++
        } else {
          const { data: created } = await supabase
            .from('voting_channels')
            .insert({ slug: channelSlug, name: channelName, is_active: true })
            .select('id').single()
          chId = created?.id; stats.channels_created++
        }
        if (chId) channelCache.set(channelSlug, chId)
      }
      if (!chId) { stats.skipped++; continue }

      // 2. Upsert edition (per channel × year)
      const edSlug = `${year}`
      const edKey = `${chId}:${year}`
      let edId = editionCache.get(edKey)
      if (!edId) {
        const { data: existing } = await supabase
          .from('voting_editions').select('id')
          .eq('channel_id', chId).eq('slug', edSlug).maybeSingle()
        if (existing) {
          edId = existing.id; stats.editions_existing++
        } else {
          const { data: created } = await supabase
            .from('voting_editions')
            .insert({
              channel_id: chId, slug: edSlug, name: `${channelName} ${year}`,
              year, status: 'archived', results_visible: 'always',
            })
            .select('id').single()
          edId = created?.id; stats.editions_created++
        }
        if (edId) editionCache.set(edKey, edId)
      }
      if (!edId) { stats.skipped++; continue }

      // 3. Upsert event (per edition × category)
      const evSlug = slugify(category).slice(0, 60)
      const evKey = `${edId}:${evSlug}`
      const participantType = workType === 'album' ? 'artist_album'
                            : (workType === 'track' || workType === 'video') ? 'artist_song'
                            : 'artist'
      let evId = eventCache.get(evKey)
      if (!evId) {
        const { data: existing } = await supabase
          .from('voting_events').select('id')
          .eq('edition_id', edId).eq('slug', evSlug).maybeSingle()
        if (existing) {
          evId = existing.id; stats.events_existing++
        } else {
          const { data: created } = await supabase
            .from('voting_events')
            .insert({
              edition_id: edId, slug: evSlug, name: category,
              participant_type: participantType,
              voting_type: 'single',
              status: 'archived', results_visible: 'always',
            })
            .select('id').single()
          evId = created?.id; stats.events_created++
        }
        if (evId) eventCache.set(evKey, evId)
      }
      if (!evId) { stats.skipped++; continue }

      // 4. Resolve work → track_id / album_id (create orphan if missing)
      let trackId: number | null = null
      let albumId: number | null = null
      const workNorm = norm(work)
      const isSelf = workType === 'self' || /^themselves$/i.test(work)
      if (!isSelf && workNorm.length > 0) {
        if (workType === 'album' || workType === 'video') {
          albumId = albumByTitle.get(workNorm) || null
          if (!albumId) {
            // Create orphan album
            const slug = slugify(`${work}-${artistId}`)
            const { data: created } = await supabase
              .from('albums')
              .insert({
                artist_id: artistId, title: work, slug,
                year, type_studio: false,
              })
              .select('id').single()
            albumId = created?.id || null
            if (albumId) {
              albumByTitle.set(workNorm, albumId)
              stats.albums_created++
            }
          }
        } else if (workType === 'track' || workType === 'unknown') {
          trackId = trackByTitle.get(workNorm) || null
          if (!trackId) {
            // Try also matching as album (some quoted entries are actually albums)
            albumId = albumByTitle.get(workNorm) || null
            if (!albumId) {
              // Create orphan track (artist linked, no album_tracks junction)
              const slug = slugify(`${work}-${artistId}-${year || ''}`)
              const { data: created } = await supabase
                .from('tracks')
                .insert({
                  artist_id: artistId, title: work, slug,
                  type: 'normal', release_year: year,
                })
                .select('id').single()
              trackId = created?.id || null
              if (trackId) {
                trackByTitle.set(workNorm, trackId)
                stats.tracks_created++
              }
            }
          }
        }
      }

      // 5. Insert participant (skip if exact same artist+work already in this event)
      const { data: existingPart } = await supabase
        .from('voting_participants').select('id, metadata')
        .eq('event_id', evId).eq('artist_id', artistId)
        .or(`track_id.eq.${trackId ?? 0},album_id.eq.${albumId ?? 0},and(track_id.is.null,album_id.is.null)`)
        .maybeSingle()

      const partMeta = {
        result,
        imported_from_award: true,
        source_line: entry.sourceLine || null,
      }

      if (existingPart) {
        // Update metadata if missing result
        const merged = { ...(existingPart.metadata || {}), ...partMeta }
        await supabase.from('voting_participants').update({ metadata: merged }).eq('id', existingPart.id)
        stats.participants_existing++
      } else {
        const displaySubtitle = work && !isSelf ? work : null
        await supabase.from('voting_participants').insert({
          event_id: evId,
          artist_id: artistId,
          track_id: trackId,
          album_id: albumId,
          display_subtitle: displaySubtitle,
          metadata: partMeta,
        })
        stats.participants_created++
      }
    } catch (e: any) {
      stats.errors.push(`${entry.channel}/${entry.year}/${entry.category}: ${e?.message || e}`)
    }
  }

  return NextResponse.json({ ok: true, mode: 'commit', stats })
}
