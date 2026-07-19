/**
 * Wiki album list scout — pati skenavimo logika, iškelta iš
 * app/api/internal/wiki-album-scout/run/route.ts į shared funkciją
 * (2026-07-17), kad ją galėtų kviesti DVI vietos be HTTP self-call'o:
 *   1) internal/wiki-album-scout/run — Bearer-auth, GitHub Actions cron'as.
 *   2) admin/wiki-album-scout/trigger — session-auth, admin „Paleisti dabar"
 *      mygtukas (žr. app/admin/inbox/albums/page.tsx) — Edvardo pastaba
 *      2026-07-17: reikia rankinio paleidimo iš admin UI, ne tik laukti
 *      kasdienio cron'o.
 *
 * Flow ir dedupe schemos komentarai — žr. pilną aprašymą faile, kur ši
 * funkcija anksčiau gyveno (dabar tas komentaras liko run/route.ts, kaip
 * orientacija skaitantiems endpoint'ą pirmą kartą).
 */

import { createAdminClient } from '@/lib/supabase'
import { fetchWikitext } from '@/lib/wiki-fetch'
import { parseAlbumListPage, albumListFingerprint, type AlbumListEntry } from '@/lib/wiki-album-list'
import { matchArtists } from '@/lib/entity-matcher'
import { commitAlbum } from '@/lib/quick-add'
import { normalizeAlbumTitle } from '@/lib/album-title'

// Padidinta 200→600 (2026-07-18): po parserio pataisymo metai turi ~1500 realių
// eilučių (visi 12 mėn., ne tik sausis). Su laiko biudžetu (žemiau) vienas scan'as
// apima žymiai daugiau; likutį užbaigia kiti manual scan'ai + kasdienis cron'as.
const MAX_FRESH_PER_RUN = 600
const MAX_AUTO_COMMITS_PER_RUN = 8
// Wall-clock biudžetas — kad neviršytume Vercel funkcijos limito (maxDuration).
const RUN_BUDGET_MS = 55000

export type WikiAlbumScoutCounters = {
  source_id: number
  source_name: string
  list_items: number
  fresh_checked: number
  skipped_known: number
  no_artist_match: number
  queued_pending: number
  updated_link: number
  auto_committed: number
  errors: number
  error_details: string[]
}

function wikiTitleFromListUrl(url: string): string | null {
  const m = (url || '').match(/wikipedia\.org\/wiki\/([^?#]+)/)
  if (!m) return null
  try { return decodeURIComponent(m[1]) } catch { return m[1] }
}

function albumWikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

export async function runWikiAlbumScout(opts: { sourceId?: string | null; dryRun?: boolean; origin: string }) {
  const explicitSourceId = opts.sourceId || null
  const dryRun = !!opts.dryRun
  const origin = opts.origin

  const supabase = createAdminClient()

  let sourcesQuery = supabase
    .from('scout_sources')
    .select('id, name, list_url')
    .eq('is_active', true)
    .eq('category', 'wiki_list')
  if (explicitSourceId) sourcesQuery = sourcesQuery.eq('id', parseInt(explicitSourceId, 10))

  const { data: sources, error: srcErr } = await sourcesQuery
  if (srcErr) return { status: 500, body: { error: srcErr.message } }
  if (!sources || sources.length === 0) {
    if (explicitSourceId) {
      return { status: 200, body: { skipped: 'inactive_or_missing', source_id: parseInt(explicitSourceId, 10) } }
    }
    return { status: 404, body: { error: 'No active wiki_list sources matched' } }
  }

  const allCounters: WikiAlbumScoutCounters[] = []
  const startedAt = Date.now()

  for (const source of sources) {
    const c: WikiAlbumScoutCounters = {
      source_id: source.id, source_name: source.name,
      list_items: 0, fresh_checked: 0, skipped_known: 0, no_artist_match: 0,
      queued_pending: 0, updated_link: 0, auto_committed: 0, errors: 0, error_details: [],
    }

    try {
      if (!source.list_url) {
        c.error_details.push('No list_url set')
        c.errors++
        allCounters.push(c)
        continue
      }

      const pageTitle = wikiTitleFromListUrl(source.list_url)
      const yearMatch = (pageTitle || '').match(/(\d{4})/)
      if (!pageTitle || !yearMatch) {
        c.error_details.push(`Nepavyko atpažinti puslapio/metų iš list_url: ${source.list_url}`)
        c.errors++
        allCounters.push(c)
        continue
      }
      const year = parseInt(yearMatch[1], 10)

      const wikitext = await fetchWikitext(pageTitle)
      if (!wikitext) throw new Error('Nepavyko gauti Wikipedia wikitext')

      const entries: AlbumListEntry[] = parseAlbumListPage(wikitext, year)
      c.list_items = entries.length

      for (const e of entries) {
        if (c.fresh_checked >= MAX_FRESH_PER_RUN) break
        if (Date.now() - startedAt > RUN_BUDGET_MS) break

        const fp = albumListFingerprint(e.artist_raw, e.album_title, e.year, e.month, e.day)

        const { data: seenRow } = await supabase
          .from('scout_seen_urls')
          .select('url_hash')
          .eq('url_hash', fp)
          .maybeSingle()
        if (seenRow) { c.skipped_known++; continue }

        const { data: existing } = await supabase
          .from('wiki_album_candidates')
          .select('id, status, album_wiki_link, matched_artist_id, match_score')
          .eq('fingerprint', fp)
          .maybeSingle()

        if (existing) {
          if (existing.status !== 'pending') { c.skipped_known++; continue }

          const link = existing.album_wiki_link || e.album_wiki_link
          if (link && c.auto_committed < MAX_AUTO_COMMITS_PER_RUN && existing.matched_artist_id) {
            c.auto_committed++
            if (!dryRun) {
              try {
                const result = await commitAlbum(albumWikiUrl(link), origin, { artist_id: existing.matched_artist_id })
                if (result.ok && result.kind === 'album') {
                  await supabase.from('wiki_album_candidates').update({
                    status: 'approved', album_wiki_link: link,
                    reviewed_at: new Date().toISOString(),
                    published_album_id: result.album.id,
                  }).eq('id', existing.id)
                } else {
                  await supabase.from('wiki_album_candidates').update({
                    status: 'error', album_wiki_link: link, rescanned_at: new Date().toISOString(),
                  }).eq('id', existing.id)
                  c.error_details.push(`Auto-commit (existing #${existing.id}) failed: ${!result.ok ? result.error : 'unknown'}`)
                }
              } catch (ce: any) {
                c.error_details.push(`Auto-commit (existing #${existing.id}) threw: ${ce.message}`)
              }
            }
          } else if (e.album_wiki_link && !existing.album_wiki_link && !dryRun) {
            await supabase.from('wiki_album_candidates').update({
              album_wiki_link: e.album_wiki_link, rescanned_at: new Date().toISOString(),
            }).eq('id', existing.id)
            c.updated_link++
          }
          continue
        }

        c.fresh_checked++

        let matches
        try {
          matches = await matchArtists([{ name: e.artist_raw }])
        } catch (me: any) {
          c.errors++
          c.error_details.push(`matchArtists failed (${e.artist_raw}): ${me.message}`)
          continue
        }
        const top = matches[0]

        // Atlikėjo match'as: stiprus (>=0.85) → kataloge (Tier 1). Silpnas/nėra →
        // „nepriskirta" (matched_artist_id=null) — VIS TIEK į eilę (Tier 2-4), kad
        // admin galėtų sukurti atlikėją+albumą, jei verta (pvz. jei turi Wiki/MB).
        // Silpni match'ai (Exo→Exodus 0.60) NEBEpriskiriami klaidingam atlikėjui.
        const MIN_ARTIST_MATCH = 0.85
        const matchedId: number | null = (top && typeof top.score === 'number' && top.score >= MIN_ARTIST_MATCH) ? top.artist_id : null
        const matchScore: number | null = matchedId ? (top!.score as number) : null

        // Dedup vs katalogas — TIK jei atlikėjas žinomas.
        if (matchedId) {
          try {
            const wantNorm = normalizeAlbumTitle(e.album_title)
            const { data: artistAlbums } = await supabase
              .from('albums').select('id, title').eq('artist_id', matchedId).limit(500)
            const existingAlbum = (artistAlbums || []).find((a: any) => normalizeAlbumTitle(a.title || '') === wantNorm)
            if (existingAlbum) {
              if (!dryRun) {
                await supabase.from('wiki_album_candidates').insert({
                  source_id: source.id, source_url: source.list_url,
                  artist_raw: e.artist_raw, album_title: e.album_title, album_wiki_link: e.album_wiki_link,
                  release_year: e.year, release_month: e.month, release_day: e.day,
                  genres_raw: e.genres, label_raw: e.label,
                  matched_artist_id: matchedId, match_score: matchScore,
                  fingerprint: fp, status: 'duplicate', reviewed_at: new Date().toISOString(),
                  published_album_id: (existingAlbum as any).id,
                })
              }
              c.skipped_known++
              continue
            }
          } catch { /* best-effort */ }
        }

        // Auto-commit wiki — TIK matched (turim atlikėją kataloge). Naujo atlikėjo
        // kūrimas NEturi būti automatinis — unmatched wiki albumus paliekam adminui.
        if (matchedId && e.album_wiki_link && c.auto_committed < MAX_AUTO_COMMITS_PER_RUN) {
          c.auto_committed++
          if (!dryRun) {
            try {
              const result = await commitAlbum(albumWikiUrl(e.album_wiki_link), origin, { artist_id: matchedId })
              const { data: inserted, error: insErr } = await supabase
                .from('wiki_album_candidates')
                .insert({
                  source_id: source.id, source_url: source.list_url,
                  artist_raw: e.artist_raw, album_title: e.album_title, album_wiki_link: e.album_wiki_link,
                  release_year: e.year, release_month: e.month, release_day: e.day,
                  genres_raw: e.genres, label_raw: e.label,
                  matched_artist_id: matchedId, match_score: matchScore,
                  fingerprint: fp,
                  status: result.ok && result.kind === 'album' ? 'approved' : 'error',
                  reviewed_at: new Date().toISOString(),
                  published_album_id: result.ok && result.kind === 'album' ? result.album.id : null,
                })
                .select('id')
                .single()
              if (insErr) {
                if (insErr.code === '23505') { c.skipped_known++ } else { c.errors++; c.error_details.push(`Insert failed: ${insErr.message}`) }
              } else if (!result.ok) {
                c.error_details.push(`Auto-commit (new, candidate #${inserted.id}) failed: ${result.error}`)
              }
            } catch (ce: any) {
              c.errors++
              c.error_details.push(`Auto-commit (new, ${e.artist_raw}) threw: ${ce.message}`)
            }
          }
          continue
        }

        // Unmatched BE Wikipedia straipsnio (Tier 3-4) — NEeiliuojam (kad neužterštume
        // eilės tūkstančiais nekatalogo albumų). Verti dėmesio unmatched turi bent
        // Wiki straipsnį (Tier 2 — galima sukurti atlikėją+albumą iš jo).
        if (!matchedId && !e.album_wiki_link) {
          if (!dryRun) {
            await supabase.from('scout_seen_urls').insert({
              url_hash: fp, source_id: source.id, candidate_id: null, filter_reason: 'unmatched_no_wiki',
            })
          }
          c.no_artist_match++
          continue
        }

        // Į eilę — matched (Tier 1) arba unmatched+wiki (Tier 2).
        if (!dryRun) {
          const { error: insErr } = await supabase.from('wiki_album_candidates').insert({
            source_id: source.id, source_url: source.list_url,
            artist_raw: e.artist_raw, album_title: e.album_title, album_wiki_link: e.album_wiki_link,
            release_year: e.year, release_month: e.month, release_day: e.day,
            genres_raw: e.genres, label_raw: e.label,
            matched_artist_id: matchedId, match_score: matchScore,
            fingerprint: fp, status: 'pending',
          })
          if (insErr && insErr.code !== '23505') { c.errors++; c.error_details.push(`Insert failed: ${insErr.message}`) }
        }
        c.queued_pending++
        if (!matchedId) c.no_artist_match++
      }

      if (!dryRun) {
        await supabase.from('scout_sources').update({ last_fetched_at: new Date().toISOString(), last_error: null }).eq('id', source.id)
      }
    } catch (e: any) {
      c.error_details.push(`Source failed: ${e.message}`)
      c.errors++
      if (!dryRun) {
        await supabase.from('scout_sources').update({ last_error: e.message?.slice(0, 500) }).eq('id', source.id)
      }
    }

    allCounters.push(c)
  }

  const summary = {
    sources_processed: allCounters.length,
    total_list_items: allCounters.reduce((s, c) => s + c.list_items, 0),
    total_fresh_checked: allCounters.reduce((s, c) => s + c.fresh_checked, 0),
    total_no_artist_match: allCounters.reduce((s, c) => s + c.no_artist_match, 0),
    total_queued_pending: allCounters.reduce((s, c) => s + c.queued_pending, 0),
    total_updated_link: allCounters.reduce((s, c) => s + c.updated_link, 0),
    total_auto_committed: allCounters.reduce((s, c) => s + c.auto_committed, 0),
    total_errors: allCounters.reduce((s, c) => s + c.errors, 0),
    dry_run: dryRun,
  }

  return { status: 200, body: { ok: true, summary, per_source: allCounters } }
}
