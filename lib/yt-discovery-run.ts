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
import { fetchFeed, type FeedItem } from '@/lib/scout-feeds'
import { matchArtists } from '@/lib/entity-matcher'
import { parseYtTitle } from '@/lib/quick-add'
import { canonicalUrlHash } from '@/lib/url-extract'

const MAX_SOURCES = 20
const MAX_FRESH_PER_RUN = 200 // matchArtists DB round-trip kiekvienam naujam

/** Playlist ID iš URL (?list=...) arba grynas ID (PL/OLAK/UU/...). */
function extractPlaylistId(s: string): string | null {
  if (!s) return null
  const m = s.match(/[?&](?:list|playlist_id)=([\w-]+)/)
  if (m) return m[1]
  if (/^(PL|OLAK|RD|UU|FL|LL)[\w-]{5,}$/.test(s.trim())) return s.trim()
  return null
}

/** Pilnas playlist'as per YouTube Data API (BE 15 ribos — 50/psl, puslapiuota). */
async function fetchPlaylistItemsData(feedUrlOrId: string, maxPages = 6): Promise<FeedItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error('YOUTUBE_API_KEY nenustatytas')
  const pid = extractPlaylistId(feedUrlOrId)
  if (!pid) throw new Error('Nepavyko atpažinti playlist ID')
  const out: FeedItem[] = []
  let pageToken = ''
  for (let p = 0; p < maxPages; p++) {
    const api = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${encodeURIComponent(pid)}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const r = await fetch(api, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) {
      if (r.status === 404) throw new Error('Playlistas nerastas arba privatus')
      throw new Error(`YouTube Data API ${r.status}`)
    }
    const data = await r.json()
    for (const it of (data.items || [])) {
      const sn = it.snippet || {}
      const cd = it.contentDetails || {}
      const vid = cd.videoId || sn.resourceId?.videoId
      if (!vid) continue
      if (sn.title === 'Private video' || sn.title === 'Deleted video') continue
      out.push({
        url: `https://www.youtube.com/watch?v=${vid}`,
        title: sn.title || '',
        published_at: cd.videoPublishedAt || sn.publishedAt || undefined,
        guid: vid,
        // videoOwnerChannelTitle = tikras video ĮKĖLĖJO kanalas (atlikėjo spėjimui).
        // sn.channelTitle būtų PLAYLIST'O savininkas — netinka.
        channel: sn.videoOwnerChannelTitle || undefined,
      })
    }
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return out
}

/** Playlist → Data API (pilnas); kitaip — Atom feed'as (15 ribotas). */
async function fetchSourceItems(feedUrl: string): Promise<FeedItem[]> {
  if (extractPlaylistId(feedUrl)) return fetchPlaylistItemsData(feedUrl)
  return fetchFeed(feedUrl)
}

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

/** Ar „kanalas" iš tikro yra playlist'o/agregatoriaus deskriptorius (ne atlikėjas)?
 *  Tokių niekad nesaugom kaip artist_raw — geriau palikti tuščią, nei rodyti
 *  „YouTube: Trending 20 Lithuania" ar „YouTube playlist PL…" kaip atlikėją. */
function isAggregatorChannel(name: string): boolean {
  const n = (name || '').trim().toLowerCase()
  if (!n) return true
  return /^youtube\b/.test(n)
    || /\bplaylist\b/.test(n)
    || /\btrending\b/.test(n)
    || /\bvarious artists\b/.test(n)
    || /\btop\s*\d/.test(n)
    || /\bcharts?\b/.test(n)
    || /\bmix\b/.test(n)
    || /\bhits\b/.test(n)
    || /\bradio\b/.test(n)
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
  let skippedExisting = 0
  const perSource: any[] = []

  for (const src of sources as any[]) {
    if (fresh >= MAX_FRESH_PER_RUN) break
    if (!src.feed_url) continue

    let items: FeedItem[] = []
    try {
      items = await fetchSourceItems(src.feed_url)
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
        if ((existing as any).status === 'pending') {
          // Retro-clean: jei pending kandidato daina JAU atsirado kataloge
          // (pvz. pridėta per topus tuo pačiu video) — pažymim duplicate, kad
          // nebekartotų. Video-id patikra (patikima, tas pats YouTube video).
          const vid2 = extractVideoId(url)
          if (vid2 && !opts.dryRun) {
            const { data: tr } = await sb.from('tracks').select('id').ilike('video_url', `%${vid2}%`).limit(1)
            if (tr && (tr as any[]).length) {
              await sb.from('yt_discovery_candidates').update({
                status: 'duplicate', published_track_id: (tr as any[])[0].id, rescanned_at: nowIso,
              }).eq('id', (existing as any).id)
              skippedExisting++
              continue
            }
          }
          // Velocity refresh (jei turim naujas views)
          if (typeof item.views === 'number') {
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
        }
        continue
      }

      // Naujas
      if (opts.dryRun) { fresh++; srcFresh++; continue }

      // Atlikėjo spėjimui — TIKRAS video kanalas (item.channel), NE src.name
      // (playlist'o deskriptorius). „Artist - Title" → dash split; be dash'o →
      // kanalas. Jei kanalas agregatorius („YouTube: Trending…") — artist tuščias.
      const realChannel = item.channel || ''
      const parsed = parseYtTitle(item.title, realChannel)
      let artistRaw = parsed.artist || ''
      if (isAggregatorChannel(artistRaw)) artistRaw = ''
      let matchedArtistId: number | null = null
      let matchScore: number | null = null
      let country: string | null = null
      try {
        const matches = artistRaw ? await matchArtists([{ name: artistRaw }], { topPerMention: 1 }) : []
        if (matches.length && matches[0].score >= 0.5) {
          matchedArtistId = matches[0].artist_id
          matchScore = Number(matches[0].score.toFixed(2))
          country = matches[0].country ?? null
        }
      } catch { /* best-effort */ }

      const scope = scopeFromMatch(country, matchedArtistId != null)
      const hPub = hoursBetween(item.published_at, now)
      const vph = typeof item.views === 'number' && hPub ? item.views / hPub : null
      const vid = extractVideoId(url)

      // Katalogo-egzistavimo patikra — kad NEkartotume jau esančių dainų (pvz.
      // jau pridėtų per topus su tuo pačiu YouTube video, arba jau turimų pas
      // atlikėją). Radus → status='duplicate' + published_track_id (nerodom
      // pending sąraše, bet fingerprint atsimena, kad nebeperklaustume).
      let existingTrackId: number | null = null
      if (vid) {
        const { data } = await sb.from('tracks').select('id').ilike('video_url', `%${vid}%`).limit(1)
        if (data && (data as any[]).length) existingTrackId = (data as any[])[0].id
      }
      if (!existingTrackId && matchedArtistId && parsed.title) {
        const { data } = await sb.from('tracks').select('id').eq('artist_id', matchedArtistId).ilike('title', parsed.title).limit(1)
        if (data && (data as any[]).length) existingTrackId = (data as any[])[0].id
      }

      const status = existingTrackId ? 'duplicate' : (isShort(url) ? 'not_music' : 'pending')

      const { error: insErr } = await sb.from('yt_discovery_candidates').insert({
        source_id: src.id,
        video_id: vid,
        video_url: url,
        guid: item.guid || null,
        raw_title: item.title,
        channel_title: item.channel || src.name || null,
        artist_raw: artistRaw || null,
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
        status,
        published_track_id: existingTrackId,
      })
      if (insErr) {
        // Lenktynės (unique fingerprint) — praleidžiam tyliai
        if (!String(insErr.message).includes('duplicate')) {
          perSource.push({ source: src.name, insert_error: String(insErr.message).slice(0, 120) })
        }
        continue
      }
      if (existingTrackId) skippedExisting++
      else if (matchedArtistId) matchedCount++
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
    body: { ok: true, dryRun: !!opts.dryRun, sources: sources.length, fresh, matched: matchedCount, skipped_existing: skippedExisting, refreshed, detail: perSource },
  }
}
