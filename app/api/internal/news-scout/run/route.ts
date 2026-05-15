/**
 * News scout endpoint — kviečiamas iš GitHub Actions cron'o.
 *
 * Flow:
 *   1. Bearer auth check (INTERNAL_CRON_TOKEN)
 *   2. Resolve scout_sources (visi aktyvūs ARBA tik nurodyti per ?source_id=N)
 *   3. Per source: fetch feed → filter seen → batch Haiku classify
 *   4. Per relevant'us: fetch full article → Sonnet normalize → match artists → insert candidate
 *   5. Return counters
 *
 * Saugumas: Niekada nepublic'as. Tik per Bearer token'ą.
 *
 * Smoke test (local):
 *   curl -X POST 'http://localhost:3000/api/internal/news-scout/run?source_id=1' \
 *        -H "Authorization: Bearer $INTERNAL_CRON_TOKEN"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { fetchFeed } from '@/lib/scout-feeds'
import { extractFromUrl, canonicalUrlHash, titleFingerprint } from '@/lib/url-extract'
import { classifyMusicRelevance, normalizeArticle } from '@/lib/ai-normalize'
import { matchArtists, matchTracks, getTopArtistsForHint } from '@/lib/entity-matcher'
import { ALLOWED_CATEGORIES } from '@/lib/news-categories'

export const runtime = 'nodejs'
export const maxDuration = 300  // Vercel max for Pro plan; smoke test ant Hobby gali timeout'inti

// Cap to fit Vercel Hobby 60s function timeout.
// Each Sonnet normalize ~10-15s; with 3 items max ~30-45s pipeline budget.
// Crow'as bega 6x/dieną → 6 runs × 3 items × 6 active sources = 108 items/d max
// (realiai daug mažiau dėl seen_urls dedupe).
const MAX_ITEMS_PER_SOURCE = 3
const HAIKU_BATCH_SIZE = 3

type RunCounters = {
  source_id: number
  source_name: string
  feed_items: number
  seen_skipped: number
  classified_irrelevant: number
  classified_relevant: number
  candidates_inserted: number
  errors: number
  error_details: string[]
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const expected = process.env.INTERNAL_CRON_TOKEN

  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_CRON_TOKEN not configured' }, { status: 503 })
  }
  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Parse query ─────────────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const explicitSourceId = searchParams.get('source_id')
  const dryRun = searchParams.get('dry_run') === '1'

  const supabase = createAdminClient()

  // ── Load sources ─────────────────────────────────────────────
  let sourcesQuery = supabase
    .from('scout_sources')
    .select('id, name, parser_key, category, feed_url, list_url')
    .eq('is_active', true)
    .in('category', ['news_lt', 'news_intl'])

  if (explicitSourceId) {
    sourcesQuery = sourcesQuery.eq('id', parseInt(explicitSourceId, 10))
  }

  const { data: sources, error: srcErr } = await sourcesQuery
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })
  if (!sources || sources.length === 0) {
    // Explicit source_id but source is inactive/missing — return 200 so matrix
    // workflow doesn't fail on deactivated sources. Without source_id, this
    // is truly an "all sources off" state and we 404 as before.
    if (explicitSourceId) {
      return NextResponse.json({
        skipped: 'inactive_or_missing',
        source_id: parseInt(explicitSourceId, 10),
        total_candidates_inserted: 0,
        total_errors: 0,
      })
    }
    return NextResponse.json({ error: 'No active sources matched' }, { status: 404 })
  }

  // Cache top artists once per run (whitelist hint visiem call'am'eams)
  const artistHint = await getTopArtistsForHint(500)

  const allCounters: RunCounters[] = []

  for (const source of sources) {
    const counter: RunCounters = {
      source_id: source.id,
      source_name: source.name,
      feed_items: 0,
      seen_skipped: 0,
      classified_irrelevant: 0,
      classified_relevant: 0,
      candidates_inserted: 0,
      errors: 0,
      error_details: [],
    }

    try {
      if (!source.feed_url) {
        counter.error_details.push('No feed_url set (list scrape not yet implemented)')
        counter.errors++
        allCounters.push(counter)
        continue
      }

      // 1) Fetch feed
      const items = await fetchFeed(source.feed_url)
      counter.feed_items = items.length

      // 2) Filter seen — iterate visus items kol gausim MAX fresh (ne pirmus N)
      const fresh: typeof items = []
      for (const it of items) {
        if (fresh.length >= MAX_ITEMS_PER_SOURCE) break
        const urlHash = canonicalUrlHash(it.url)
        const { data: seen } = await supabase
          .from('scout_seen_urls')
          .select('url_hash')
          .eq('url_hash', urlHash)
          .maybeSingle()
        if (seen) {
          counter.seen_skipped++
          continue
        }
        fresh.push(it)
      }

      if (fresh.length === 0) {
        allCounters.push(counter)
        continue
      }

      // 3) Haiku batch classify (kelis batch'us po HAIKU_BATCH_SIZE)
      const relevantItems: Array<typeof fresh[0] & { ai_category: string; ai_confidence: number }> = []
      for (let i = 0; i < fresh.length; i += HAIKU_BATCH_SIZE) {
        const batch = fresh.slice(i, i + HAIKU_BATCH_SIZE)
        const classifyInput = batch.map((b, idx) => ({
          idx: i + idx,
          title: b.title,
          summary: b.summary,
        }))

        try {
          const verdicts = await classifyMusicRelevance(classifyInput)

          for (const v of verdicts) {
            const it = fresh[v.idx]
            if (!it) continue
            if (ALLOWED_CATEGORIES.has(v.category as any) && v.confidence >= 0.5) {
              relevantItems.push({
                ...it,
                ai_category: v.category,
                ai_confidence: v.confidence,
              })
              counter.classified_relevant++
            } else {
              // Mark seen su filter_reason kad nepasikartotų rytoj
              const urlHash = canonicalUrlHash(it.url)
              if (!dryRun) {
                await supabase.from('scout_seen_urls').insert({
                  url_hash: urlHash,
                  source_id: source.id,
                  candidate_id: null,
                  filter_reason: v.category === 'none' ? 'not_music' : 'low_confidence',
                })
              }
              counter.classified_irrelevant++
            }
          }
        } catch (e: any) {
          counter.error_details.push(`Haiku batch failed: ${e.message}`)
          counter.errors++
        }
      }

      // 4) Per relevant: fetch full article + Sonnet normalize + match
      for (const rel of relevantItems) {
        try {
          const article = await extractFromUrl(rel.url)
          // Pridedam embed'us į užklausos tekstą — Sonnet galės juos atskirti
          const embedHint = article.embed_urls.length > 0
            ? `\n\nSOURCE'E RASTI EMBED'AI (YT/Spotify/SoundCloud/Bandcamp) — ĮDĖK į embed_urls output'ą:\n${article.embed_urls.join('\n')}`
            : ''
          const ai = await normalizeArticle({
            full_text: article.text + embedHint,
            source_lang: article.source_lang || (source.category === 'news_lt' ? 'lt' : 'en'),
            source_name: source.name,
            source_url: rel.url,
            artist_whitelist: artistHint,
          })
          // Jeigu Sonnet'as nepasiūlė embed'ų, naudojam source'e rastus tiesiogiai
          if ((!ai.embed_urls || ai.embed_urls.length === 0) && article.embed_urls.length > 0) {
            ai.embed_urls = article.embed_urls
          }

          // AI gali persigalvoti kategorijos — re-check ALLOWED
          if (!ALLOWED_CATEGORIES.has(ai.category as any)) {
            const urlHash = canonicalUrlHash(rel.url)
            const debugMsg = `Sonnet rejected ${rel.url}: category="${ai.category}" conf=${ai.confidence} title="${(ai.title || '').slice(0, 60)}" raw="${(ai.raw_response || '').slice(0, 200)}"`
            counter.error_details.push(debugMsg)
            if (!dryRun) {
              await supabase.from('scout_seen_urls').insert({
                url_hash: urlHash,
                source_id: source.id,
                candidate_id: null,
                filter_reason: `sonnet_rejected:${ai.category || 'unknown'}`,
              })
            }
            counter.classified_irrelevant++
            continue
          }

          // Entity matching
          const artistMatches = await matchArtists(ai.artists_mentioned)
          const primaryArtist = artistMatches[0]
          const trackMatches = primaryArtist
            ? await matchTracks(ai.tracks_mentioned, [primaryArtist.artist_id])
            : []

          // Insert
          if (!dryRun) {
            const urlHash = canonicalUrlHash(rel.url)
            const tFp = titleFingerprint(ai.title || article.title)

            const { data: inserted, error: insErr } = await supabase
              .from('news_candidates')
              .insert({
                source_type: 'scout_rss',
                source_id: source.id,
                source_url: rel.url,
                source_portal: source.parser_key,
                raw_text: article.text.slice(0, 20_000),
                raw_html: null, // skip raw_html to save space; can re-fetch if needed
                raw_lang: article.source_lang,
                ai_category: ai.category,
                ai_title: ai.title,
                ai_body: ai.body_html,
                ai_summary: ai.summary,
                ai_confidence: ai.confidence,
                ai_model: ai.model,
                suggested_artist_ids: artistMatches.map(a => a.artist_id),
                suggested_track_ids: trackMatches.map(t => t.track_id),
                primary_artist_id: primaryArtist?.artist_id || artistMatches[0]?.artist_id || null,
                suggested_image_url: article.lead_image_url || null,
                embed_urls: ai.embed_urls || [],
                url_canonical_hash: urlHash,
                title_fingerprint: tFp,
                status: 'pending',
              })
              .select('id')
              .single()

            if (insErr) {
              counter.error_details.push(`Insert failed: ${insErr.message}`)
              counter.errors++
              continue
            }

            await supabase.from('scout_seen_urls').insert({
              url_hash: urlHash,
              source_id: source.id,
              candidate_id: inserted.id,
            })

            counter.candidates_inserted++
          } else {
            counter.candidates_inserted++ // dry-run counter
          }
        } catch (e: any) {
          counter.error_details.push(`Item failed (${rel.url}): ${e.message}`)
          counter.errors++
        }
      }

      // Update source last_fetched_at
      if (!dryRun) {
        await supabase
          .from('scout_sources')
          .update({ last_fetched_at: new Date().toISOString(), last_error: null })
          .eq('id', source.id)
      }
    } catch (e: any) {
      counter.error_details.push(`Source failed: ${e.message}`)
      counter.errors++
      if (!dryRun) {
        await supabase
          .from('scout_sources')
          .update({ last_error: e.message?.slice(0, 500) })
          .eq('id', source.id)
      }
    }

    allCounters.push(counter)
  }

  // Summary
  const summary = {
    sources_processed: allCounters.length,
    total_candidates_inserted: allCounters.reduce((s, c) => s + c.candidates_inserted, 0),
    total_filtered: allCounters.reduce((s, c) => s + c.classified_irrelevant, 0),
    total_errors: allCounters.reduce((s, c) => s + c.errors, 0),
    dry_run: dryRun,
  }

  return NextResponse.json({
    ok: true,
    summary,
    per_source: allCounters,
  })
}

// Convenience GET for sanity check (no work done, just confirms auth)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!process.env.INTERNAL_CRON_TOKEN || token !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, msg: 'news-scout endpoint healthy. Use POST to run.' })
}
