/**
 * lib/yt-discovery-run.ts — YouTube velocity discovery scout (punktas A).
 *
 * STATUSAS: dormant. Sukasi TIK per scout_sources WHERE category='yt_discovery'
 * AND is_active=true. Migracija seed'ina šaltinius su is_active=false, tad kol
 * Edvardas neaktyvuoja — `runYtDiscovery()` grąžina no-op. Nieko neauto-publish'ina
 * (tik review eilė `yt_discovery_candidates`), tad saugu ir neaktyvavus.
 *
 * Flow (mirror'ina news/wiki-album scout):
 *   fetchFeed(feed_url) [su views iš media:statistics] → per įrašą:
 *     - fingerprint = canonicalUrlHash(video_url); dedupe per yt_discovery_candidates
 *     - jei jau matytas ir dar 'pending' → atnaujinam velocity (Δviews/Δlaikas)
 *     - jei naujas → parseYtTitle → matchArtists → scope (lt/foreign/unknown) →
 *       velocity (views/val nuo published) → insert status='pending'
 *
 * Velocity: views/val. Pirmą kartą — views ÷ valandos nuo published. Antrą+ kartą —
 * (views_now - views_first) ÷ valandos tarp nuskaitymų (šviežesnis „ar kyla dabar").
 *
 * NĖRA auto-commit. Review UI (`/admin/inbox/discovery`) tvirtina rankiniu būdu
 * (arba, vėliau, „Sukurti atlikėją + pridėti" su grounded artist-fill).
 */

import { createAdminClient } from '@/lib/supabase'
import { fetchFeed } from '@/lib/scout-feeds'
import { matchArtists } from '@/lib/entity-matcher'
import { parseYtTitle } from '@/lib/quick-add'
import { canonicalUrlHash } from '@/lib/url-extract'

const MAX_SOURCES = 12
const MAX_FRESH_PER_RUN = 120 // matchArtists DB round-trip kiekvienam naujam

type RunOpts = { sourceId?: string | null; dryRun?: boolean; origin: string }
type RunResult = { status: number; body: any }

function extractVideoId(url: string): string | null {
  const m = url.match(/(?:[?&]v=|\/shorts\/|\/watch\/)([\w-]{6,})/) || url.match(/youtu\.be\/([\w-]{6,})/)
  return m ? m[1] : null
}

function isShort(url: string): boolean {
  return /\/shorts\//i.test(url)
}

function hoursBetween(aIso: string | undefined | null, bMs: number): number | null {
  if (!aIso) return null
  const a = Date.parse(aIso)
  if (!Number.isFinite(a)) return null
  const h = (bMs - a) / 3600000
  return h > 0 ? h : null
}

function scopeFromMatch(country?: string | null, matched?: boolean): 'lt' | 'foreign' | 'unknown' {
  if (!matched) return 'unknown'
  const c = (country || '').toLowerCase()
  return c.includes('lietuv') || c === 'lt' ? 'lt' : 'foreign'
}

export async function runYtDiscovery(opts: RunOpts): Promise<RunResult> {
  const sb = createAdminClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Aktyvūs šaltiniai (dormant kol jų nėra / visi is_active=false)
  let q = sb
    .from('scout_sources')
    .select('id, name, feed_url, parser_key')
    .eq('category', 'yt_discovery')
    .eq('is_active', true)
  if (opts.sourceId) q = q.eq('id', Number(opts.sourceId))
  const { data: sources, error: srcErr } = await q.limit(MAX_SOURCES)

  if (srcErr) return { status: 500, body: { ok: false, error: srcErr.message } }
  if (!sources || sources.length === 0) {
    return { status: 200, body: { ok: true, message: 'Nėra aktyvių yt_discovery šaltinių (dormant).', fresh: 0, matched: 0 } }
  }

  let fresh = 0
  let matchedCount = 0
  let refreshed = 0
  const perSource: any[] = []

  for (const src of sources as any[]) {
    if (fresh >= MAX_FRESH_PER_RUN) break
    if (!src.feed_url) continue

    let items: Awaited<ReturnType<typeof fetchFeed>> = []
    try {
      items = await fetchFeed(src.feed_url)
    } catch (e: any) {
      await sb.from('scout_sources').update({ last_error: String(e?.message || e).slice(0, 300), last_fetched_at: nowIso }).eq('id', src.id)
      perSource.push({ source: src.name, error: String(e?.message || e).slice(0, 120) })
      continue
    }

    let srcFresh = 0
    for (const item of items) {
      if (fresh >= MAX_FRESH_PER_RUN) break
      const url = item.url
      if (!url) continue
      const fingerprint = canonicalUrlHash(url)

      // Dedupe
      const { data: existing } = await sb
        .from('yt_discovery_candidates')
        .select('id, status, views_first, views_first_at')
        .eq('fingerprint', fingerprint)
        .maybeSingle()

      if (existing) {
        // Velocity refresh (tik jei dar pending ir turim naujas views)
        if ((existing as any).status === 'pending' && typeof item.views === 'number') {
          const vFirst = (existing as any).views_first as number | null
          const vFirstAt = (existing as any).views_first_at as string | null
          let vph: number | null = null
          const hFromFirst = hoursBetween(vFirstAt, now)
          if (vFirst != null && hFromFirst && item.views >= vFirst) {
            vph = (item.views - vFirst) / hFromFirst
          } else {
            const hPub = hoursBetween(item.published_at, now)
            if (hPub) vph = item.views / hPub
          }
          if (!opts.dryRun) {
            await sb.from('yt_discovery_candidates').update({
              views_last: item.views,
              views_last_at: nowIso,
              velocity_vph: vph,
              rescanned_at: nowIso,
            }).eq('id', (existing as any).id)
          }
          refreshed++
        }
        continue
      }

      // Naujas
      if (opts.dryRun) { fresh++; srcFresh++; continue }

      const parsed = parseYtTitle(item.title, src.name || '')
      let matchedArtistId: number | null = null
      let matchScore: number | null = null
      let country: string | null = null
      try {
        const matches = await matchArtists([{ name: parsed.artist }], { topPerMention: 1 })
        if (matches.length && matches[0].score >= 0.5) {
          matchedArtistId = matches[0].artist_id
          matchScore = Number(matches[0].score.toFixed(2))
          country = matches[0].country ?? null
        }
      } catch { /* best-effort */ }

      const scope = scopeFromMatch(country, matchedArtistId != null)
      const hPub = hoursBetween(item.published_at, now)
      const vph = typeof item.views === 'number' && hPub ? item.views / hPub : null

      const { error: insErr } = await sb.from('yt_discovery_candidates').insert({
        source_id: src.id,
        video_id: extractVideoId(url),
        video_url: url,
        guid: item.guid || null,
        raw_title: item.title,
        channel_title: src.name || null,
        artist_raw: parsed.artist || null,
        title_raw: parsed.title || null,
        published_at: item.published_at || null,
        views_first: typeof item.views === 'number' ? item.views : null,
        views_first_at: nowIso,
        views_last: typeof item.views === 'number' ? item.views : null,
        views_last_at: nowIso,
        velocity_vph: vph,
        matched_artist_id: matchedArtistId,
        match_score: matchScore,
        scope,
        fingerprint,
        status: isShort(url) ? 'not_music' : 'pending', // Shorts default'u atmetam (dažniausiai ne pilna daina)
      })
      if (insErr) {
        // Lenktynės (unique fingerprint) — praleidžiam tyliai
        if (!String(insErr.message).includes('duplicate')) {
          perSource.push({ source: src.name, insert_error: String(insErr.message).slice(0, 120) })
        }
        continue
      }
      if (matchedArtistId) matchedCount++
      fresh++
      srcFresh++
    }

    if (!opts.dryRun) {
      await sb.from('scout_sources').update({ last_fetched_at: nowIso, last_error: null }).eq('id', src.id)
    }
    perSource.push({ source: src.name, items: items.length, fresh: srcFresh })
  }

  return {
    status: 200,
    body: { ok: true, dryRun: !!opts.dryRun, sources: sources.length, fresh, matched: matchedCount, refreshed, detail: perSource },
  }
}
