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
import { normalizeAlbumTitle } from '@/lib/album-title'

// Scan'as = GREITA discovery (match + queue), be lėto auto-commit'o. Anksčiau
// auto-commit (8 × ~3s Wiki fetch+album create) suvalgydavo biudžetą per ~70 eilučių
// (liko tik sausis), o per-entry matchArtists (~0.8s trgm fuzzy) — likusį (liko iki kovo).
// Dabar: katalogas įkeliamas Į ATMINTĮ (Map), seen/candidate fingerprint'ai preload'inami
// Set'ais, insert'ai BATCH'ais → vienas run'as apima VISUS metus (12 mėn) + senus metus.
const MAX_FRESH_PER_RUN = 20000     // in-memory match → greita, vienas run'as apima visus metus
// Wall-clock biudžetas — po maxDuration (300s) su atsarga.
const RUN_BUDGET_MS = 240000

// Vardo normalizacija match'ui: mažosios, be diakritikų (combining marks U+0300–U+036F),
// ne-alfanumerika → tarpas. Tas pats principas kaip normalizeAlbumTitle atlikėjo vardui.
function normName(s: string): string {
  const decomposed = (s || '').toLowerCase().normalize('NFD')
  let out = ''
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0) || 0
    if (cp >= 0x300 && cp <= 0x36f) continue // combining diacritic — praleidžiam
    out += ch
  }
  return out.replace(/[^a-z0-9]+/g, ' ').trim()
}

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

  // ── Katalogas Į ATMINTĮ (vieną kartą visiems source'ams) ──
  // 16k+ atlikėjų → Map<normName, {id, score}>. Pakeičia per-entry matchArtists
  // (trgm fuzzy ~0.8s/eilutei), kuris ir „suvalgydavo" biudžetą iki kovo.
  const nameToArtist = new Map<string, { id: number; score: number }>()
  {
    const PAGE = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase.from('artists').select('id, name, score').range(from, from + PAGE - 1)
      if (error) return { status: 500, body: { error: `Katalogo įkėlimas nepavyko: ${error.message}` } }
      const rows = (data || []) as any[]
      for (const a of rows) {
        const n = normName(a.name || '')
        if (!n) continue
        if (!nameToArtist.has(n)) nameToArtist.set(n, { id: a.id, score: typeof a.score === 'number' ? a.score : 0 })
      }
      if (rows.length < PAGE) break
      from += PAGE
    }
  }

  // Biudžeto laikrodis — PO katalogo įkėlimo (kad discovery gautų pilnus 240s).
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

      // ── Preload šio source'o fingerprint'ai (seen + jau esami kandidatai) ──
      // Pakeičia 2 per-entry point-lookup'us (~830 round-trip'ų → 0 loope).
      const seenSet = new Set<string>()
      {
        const PAGE = 1000
        let from = 0
        for (;;) {
          const { data } = await supabase.from('scout_seen_urls').select('url_hash').eq('source_id', source.id).range(from, from + PAGE - 1)
          const rows = (data || []) as any[]
          for (const r of rows) seenSet.add(r.url_hash)
          if (rows.length < PAGE) break
          from += PAGE
        }
      }
      const existingCand = new Map<string, { id: number; status: string; album_wiki_link: string | null }>()
      {
        const PAGE = 1000
        let from = 0
        for (;;) {
          const { data } = await supabase.from('wiki_album_candidates').select('id, fingerprint, status, album_wiki_link').eq('source_id', source.id).range(from, from + PAGE - 1)
          const rows = (data || []) as any[]
          for (const r of rows) existingCand.set(r.fingerprint, { id: r.id, status: r.status, album_wiki_link: r.album_wiki_link })
          if (rows.length < PAGE) break
          from += PAGE
        }
      }

      // ── 1 praėjimas: skip žinomus, in-memory match, surenkam „fresh" ──
      type Fresh = { e: AlbumListEntry; fp: string; matchedId: number | null; matchScore: number | null }
      const fresh: Fresh[] = []
      const toUpdateLink: { id: number; link: string }[] = []
      const matchedIds = new Set<number>()
      const runFps = new Set<string>() // dedupe TAME PAČIAME run'e (tas pats albumas sąraše 2×)

      for (const e of entries) {
        if (c.fresh_checked >= MAX_FRESH_PER_RUN) break
        if (Date.now() - startedAt > RUN_BUDGET_MS) break

        const fp = albumListFingerprint(e.artist_raw, e.album_title, e.year, e.month, e.day)
        if (runFps.has(fp)) continue
        if (seenSet.has(fp)) { c.skipped_known++; continue }

        const ex = existingCand.get(fp)
        if (ex) {
          if (ex.status !== 'pending') { c.skipped_known++; continue }
          if (e.album_wiki_link && !ex.album_wiki_link) { toUpdateLink.push({ id: ex.id, link: e.album_wiki_link }); c.updated_link++ }
          runFps.add(fp)
          continue
        }

        runFps.add(fp)
        c.fresh_checked++

        // Atlikėjo match'as IŠ ATMINTIES: tikslus normName sutapimas su katalogu → Tier 1.
        // Nėra sutapimo → „nepriskirta" (matched_artist_id=null) — VIS TIEK į eilę (Tier 2-4),
        // jei atlikėjas turi Wikipedia straipsnį. Silpni fuzzy match'ai (Exo→Exodus)
        // nebedaromi, tad klaidingų priskyrimų nebėra.
        const nm = normName(e.artist_raw)
        const hit = nm ? nameToArtist.get(nm) : undefined
        const matchedId: number | null = hit ? hit.id : null
        const matchScore: number | null = matchedId ? 1.0 : null
        if (matchedId) matchedIds.add(matchedId)
        fresh.push({ e, fp, matchedId, matchScore })
      }

      // ── Batch-load matched atlikėjų albumus (dedup vs katalogas) ──
      const artistAlbums = new Map<number, Map<string, number>>() // artistId → normTitle → albumId
      if (matchedIds.size > 0) {
        const ids = Array.from(matchedIds)
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200)
          const { data } = await supabase.from('albums').select('id, artist_id, title').in('artist_id', chunk)
          for (const a of (data || []) as any[]) {
            let m = artistAlbums.get(a.artist_id)
            if (!m) { m = new Map(); artistAlbums.set(a.artist_id, m) }
            const nt = normalizeAlbumTitle(a.title || '')
            if (!m.has(nt)) m.set(nt, a.id)
          }
        }
      }

      // ── 2 praėjimas: surenkam insert'us (pending / duplicate / seen) ──
      const nowIso = new Date().toISOString()
      const baseRow = (f: Fresh) => ({
        source_id: source.id, source_url: source.list_url,
        artist_raw: f.e.artist_raw, album_title: f.e.album_title, album_wiki_link: f.e.album_wiki_link,
        release_year: f.e.year, release_month: f.e.month, release_day: f.e.day,
        genres_raw: f.e.genres, label_raw: f.e.label,
        matched_artist_id: f.matchedId, match_score: f.matchScore,
        fingerprint: f.fp,
      })
      const toInsert: any[] = []
      const toSeen: any[] = []
      for (const f of fresh) {
        // Dedup vs katalogas — TIK jei atlikėjas žinomas.
        if (f.matchedId) {
          const m = artistAlbums.get(f.matchedId)
          const dupId = m ? m.get(normalizeAlbumTitle(f.e.album_title)) : undefined
          if (dupId !== undefined) {
            toInsert.push({ ...baseRow(f), status: 'duplicate', reviewed_at: nowIso, published_album_id: dupId })
            c.skipped_known++
            continue
          }
        }

        // Ne-katalogo (unmatched) albumus imam TIK jei ATLIKĖJAS turi Wikipedia
        // straipsnį (mėlyna nuoroda sąraše) — „top"/notable požymis. Obskuriškus
        // (be atlikėjo wiki) praleidžiam, kad neužterštume eilės (Edvardo pasirinkimas).
        if (!f.matchedId && !f.e.artist_wiki_link) {
          toSeen.push({ url_hash: f.fp, source_id: source.id, candidate_id: null, filter_reason: 'unmatched_artist_not_notable' })
          c.no_artist_match++
          continue
        }

        // Į eilę — matched (Tier 1) arba unmatched+wiki (Tier 2).
        toInsert.push({ ...baseRow(f), status: 'pending' })
        c.queued_pending++
        if (!f.matchedId) c.no_artist_match++
      }

      // ── Batch flush ──
      if (!dryRun) {
        // Kandidatai — chunk'ais po 500. Jei chunk'as krenta dėl unikalumo (23505,
        // lenktynės su kitu run'u), fallback į po-vieną (kad nemestume viso chunk'o).
        for (let i = 0; i < toInsert.length; i += 500) {
          const chunk = toInsert.slice(i, i + 500)
          const { error: insErr } = await supabase.from('wiki_album_candidates').insert(chunk)
          if (insErr) {
            if (insErr.code === '23505') {
              for (const row of chunk) {
                const { error: rowErr } = await supabase.from('wiki_album_candidates').insert(row)
                if (rowErr && rowErr.code !== '23505') { c.errors++; c.error_details.push(`Insert failed: ${rowErr.message}`) }
              }
            } else {
              c.errors++
              c.error_details.push(`Batch insert failed: ${insErr.message}`)
            }
          }
        }
        for (let i = 0; i < toSeen.length; i += 500) {
          const chunk = toSeen.slice(i, i + 500)
          await supabase.from('scout_seen_urls').insert(chunk).then(() => {}, () => {})
        }
        for (const u of toUpdateLink) {
          await supabase.from('wiki_album_candidates').update({ album_wiki_link: u.link, rescanned_at: nowIso }).eq('id', u.id)
        }
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
