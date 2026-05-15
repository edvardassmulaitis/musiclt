/**
 * Events scout endpoint — kviečiamas iš GitHub Actions cron'o.
 *
 * Flow:
 *   1. Bearer auth
 *   2. Resolve scout_sources WHERE category='tickets'
 *   3. Per source: fetch list → dedupe → fetch detail → Sonnet normalize → matchAS → insert
 *
 * Smoke test:
 *   curl -X POST 'https://music.lt/api/internal/events-scout/run?source_id=10' \
 *        -H "Authorization: Bearer $INTERNAL_CRON_TOKEN"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { fetchEventList, fetchEventDetail, eventFingerprint, eventUrlHash } from '@/lib/events-extract'
import { normalizeEvent } from '@/lib/ai-event-normalize'
import { matchArtists, getTopArtistsForHint } from '@/lib/entity-matcher'

export const runtime = 'nodejs'
export const maxDuration = 300

// Cap to fit Vercel Hobby 60s function timeout.
// Each Sonnet event normalize ~10-15s; 3 items max ~30-45s pipeline budget.
const MAX_EVENTS_PER_SOURCE = 3

type RunCounters = {
  source_id: number
  source_name: string
  list_items: number
  seen_skipped: number
  not_music: number
  inserted: number
  errors: number
  error_details: string[]
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN
  if (!expected) return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  if (!token || token !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const explicitSourceId = searchParams.get('source_id')
  const dryRun = searchParams.get('dry_run') === '1'

  const supabase = createAdminClient()

  let sourcesQuery = supabase
    .from('scout_sources')
    .select('id, name, parser_key, list_url')
    .eq('is_active', true)
    .eq('category', 'tickets')
  if (explicitSourceId) sourcesQuery = sourcesQuery.eq('id', parseInt(explicitSourceId, 10))

  const { data: sources, error: srcErr } = await sourcesQuery
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
  if (!sources || sources.length === 0) {
    // Explicit source_id but inactive/missing — return 200 so matrix workflow
    // doesn't fail on deactivated sources. Without source_id we 404 as before.
    if (explicitSourceId) {
      return NextResponse.json({
        skipped: 'inactive_or_missing',
        source_id: parseInt(explicitSourceId, 10),
        total_candidates_inserted: 0,
        total_errors: 0,
      })
    }
    return NextResponse.json({ error: 'No active ticket sources matched' }, { status: 404 })
  }

  const artistHint = await getTopArtistsForHint(500)
  const allCounters: RunCounters[] = []

  for (const source of sources) {
    const c: RunCounters = {
      source_id: source.id,
      source_name: source.name,
      list_items: 0,
      seen_skipped: 0,
      not_music: 0,
      inserted: 0,
      errors: 0,
      error_details: [],
    }

    try {
      if (!source.list_url) {
        c.error_details.push('No list_url set')
        c.errors++
        allCounters.push(c)
        continue
      }

      const items = await fetchEventList(source.list_url, source.parser_key)
      c.list_items = items.length

      // Filter seen pagal URL hash (scout_seen_urls reuse'inam)
      const fresh: typeof items = []
      for (const it of items) {
        if (fresh.length >= MAX_EVENTS_PER_SOURCE) break
        const urlHash = eventUrlHash(it.url)
        const { data: seen } = await supabase
          .from('scout_seen_urls')
          .select('url_hash')
          .eq('url_hash', urlHash)
          .maybeSingle()
        if (seen) { c.seen_skipped++; continue }
        fresh.push(it)
      }

      if (fresh.length === 0) {
        allCounters.push(c)
        continue
      }

      for (const item of fresh) {
        try {
          const detail = await fetchEventDetail(item.url)
          // Merge listing-level info su detail
          const merged = {
            ...detail,
            title: detail.title || item.title,
            venue_name: detail.venue_name || item.venue_text,
            city: detail.city || item.city,
            image_url: detail.image_url || item.image_url,
            price_text: detail.price_text || item.price_text,
            event_date_text: detail.event_date_text || item.date_text,
            source_portal: source.parser_key,
            artist_whitelist: artistHint,
          }

          const ai = await normalizeEvent(merged)
          const urlHash = eventUrlHash(item.url)

          if (!ai.is_music_event) {
            if (!dryRun) {
              await supabase.from('scout_seen_urls').insert({
                url_hash: urlHash,
                source_id: source.id,
                candidate_id: null,
                filter_reason: 'not_music_event',
              })
            }
            c.not_music++
            continue
          }

          // Artist matching
          const artistMatches = await matchArtists(ai.artists_mentioned)
          const primaryArtist = artistMatches[0]

          // Fingerprint (dedupe iš kelių portalų)
          const fp = eventFingerprint(ai.title || merged.title, ai.event_date_iso || ai.event_date_text || merged.event_date_text, ai.city || merged.city)

          if (!dryRun) {
            const { data: inserted, error: insErr } = await supabase
              .from('event_candidates')
              .insert({
                source_type: 'scout_scrape',
                source_id: source.id,
                source_url: item.url,
                source_portal: source.parser_key,
                title: ai.title || merged.title,
                event_date: ai.event_date_iso || null,
                event_date_text: ai.event_date_text || merged.event_date_text || null,
                venue_name_raw: ai.venue_name || merged.venue_name || null,
                city: ai.city || merged.city || null,
                description: ai.description_html,
                ticket_url: ai.ticket_url || item.url,
                price_text: ai.price_text || merged.price_text || null,
                image_url: ai.image_url || merged.image_url || null,
                suggested_artist_ids: artistMatches.map(a => a.artist_id),
                primary_artist_id: primaryArtist?.artist_id || null,
                fingerprint: fp,
                ai_confidence: ai.confidence,
                ai_model: ai.model,
                status: 'pending',
              })
              .select('id')
              .single()

            if (insErr) {
              // Duplicate fingerprint = 23505 unique violation — laikom kaip "duplicate"
              if (insErr.code === '23505') {
                await supabase.from('scout_seen_urls').insert({
                  url_hash: urlHash,
                  source_id: source.id,
                  candidate_id: null,
                  filter_reason: 'duplicate_fingerprint',
                })
              } else {
                c.error_details.push(`Insert failed: ${insErr.message}`)
                c.errors++
              }
              continue
            }

            await supabase.from('scout_seen_urls').insert({
              url_hash: urlHash,
              source_id: source.id,
              candidate_id: inserted.id,
            })
          }
          c.inserted++
        } catch (e: any) {
          c.error_details.push(`Item failed (${item.url}): ${e.message}`)
          c.errors++
        }
      }

      if (!dryRun) {
        await supabase
          .from('scout_sources')
          .update({ last_fetched_at: new Date().toISOString(), last_error: null })
          .eq('id', source.id)
      }
    } catch (e: any) {
      c.error_details.push(`Source failed: ${e.message}`)
      c.errors++
      if (!dryRun) {
        await supabase
          .from('scout_sources')
          .update({ last_error: e.message?.slice(0, 500) })
          .eq('id', source.id)
      }
    }

    allCounters.push(c)
  }

  const summary = {
    sources_processed: allCounters.length,
    total_inserted: allCounters.reduce((s, c) => s + c.inserted, 0),
    total_not_music: allCounters.reduce((s, c) => s + c.not_music, 0),
    total_seen: allCounters.reduce((s, c) => s + c.seen_skipped, 0),
    total_errors: allCounters.reduce((s, c) => s + c.errors, 0),
    dry_run: dryRun,
  }

  return NextResponse.json({ ok: true, summary, per_source: allCounters })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!process.env.INTERNAL_CRON_TOKEN || token !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, msg: 'events-scout endpoint healthy. Use POST to run.' })
}
