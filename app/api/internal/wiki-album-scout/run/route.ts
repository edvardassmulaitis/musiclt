/**
 * Wiki album list scout endpoint — punktas B (žr. MUSIC_DISCOVERY_AUTOMATION_PLAN.md §B).
 * Kviečiamas iš GitHub Actions cron'o (mirror'ina news-scout/events-scout pattern'ą —
 * NE Cowork scheduled task, žr. EXTERNAL_CHARTS_PLAN.md §9 dingusio scheduled
 * task'o pamoką). Nuo 2026-07-17 pati skenavimo logika gyvena
 * `lib/wiki-album-scout-run.ts` (`runWikiAlbumScout()`), kad ją galėtų kviesti
 * IR admin „Paleisti dabar" mygtukas (`app/api/admin/wiki-album-scout/trigger`)
 * be HTTP self-call'o — žr. to failo viršutinį komentarą dėl priežasties.
 *
 * Flow (per scout_sources WHERE category='wiki_list'):
 *   1. Bearer auth (šis endpoint'as)
 *   2. fetchWikitext(list_url puslapio title'as) → parseAlbumListPage()
 *   3. Per eilutę — fingerprint = sha1(artist|album|data), TRIJŲ lygių memory:
 *
 *      a) scout_seen_urls (fingerprint=url_hash, filter_reason='no_artist_match')
 *         — PERMANENT skip, kai atlikėjas nerastas kataloge (tas pats kaip
 *           news/events scout — mirror'ina B.3 taisyklę "atlikėjas nerastas →
 *           nesukuriam nieko").
 *      b) wiki_album_candidates (fingerprint UNIQUE) — SĄMONINGAS NUKRYPIMAS
 *         nuo pradinio plano (kuris siūlė scout_seen_urls kaip vienintelę
 *         dedupe atmintį): kai atlikėjas RASTAS, bet album_wiki_link dar NĖRA,
 *         eilutė patenka į šitą lentelę su status='pending' — TAI YRA memory,
 *         ne scout_seen_urls, nes rescan'o metu reikia PALYGINTI naują
 *         album_wiki_link su senu (jei atsirado — auto-commit'inam). Jei
 *         scout_seen_urls būtų naudojama čia, "seen" reikštų amžiną
 *         ignoravimą ir link'o atsiradimas niekad nebūtų pastebėtas.
 *      c) Terminaliniai statusai (approved/rejected/duplicate/error) —
 *         wiki_album_candidates.fingerprint jau egzistuoja, praleidžiam visad.
 *
 *   4. Auto vs. review (B.3): atlikėjas rastas + album_wiki_link →
 *      commitAlbum(albumWikiUrl, origin, {artist_id}) auto-commit. Atlikėjas
 *      rastas, be link'o → review queue (wiki_album_candidates, pending).
 *      Atlikėjas nerastas → nieko nesukuriam (a punktas aukščiau).
 *
 * Cap'ai (Vercel Hobby ~60s wall-clock, žr. events-scout.ts analogišką
 * komentarą): MAX_FRESH_PER_RUN riboja kiek NIEKAD-nematytų eilučių tikrinam
 * per vieną paleidimą (matchArtists DB round-trip'as kiekvienai),
 * MAX_AUTO_COMMITS_PER_RUN riboja kiek pilnų commitAlbum() (išorinis
 * Wikipedia+cover fetch, lėčiau) per paleidimą. Jau apdorotos eilutės
 * (scout_seen_urls ARBA wiki_album_candidates) NESKAIČIUOJAMOS į fresh cap'ą —
 * tad kasdieninis/manual re-run natūraliai "praeina" per likusias, kol
 * susidoroja su visu ~3000 eilučių backlog'u per kelis paleidimus.
 *
 * Smoke test:
 *   curl -X POST 'https://music.lt/api/internal/wiki-album-scout/run?dry_run=1' \
 *        -H "Authorization: Bearer $INTERNAL_CRON_TOKEN"
 */

import { NextRequest, NextResponse } from 'next/server'
import { runWikiAlbumScout } from '@/lib/wiki-album-scout-run'

export const runtime = 'nodejs'
export const maxDuration = 300

function baseUrl(): string {
  return process.env.MUSICLT_BASE_URL || `https://${process.env.VERCEL_URL || 'musiclt.vercel.app'}`
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

  const { status, body } = await runWikiAlbumScout({ sourceId: explicitSourceId, dryRun, origin: baseUrl() })
  return NextResponse.json(body, { status })
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!process.env.INTERNAL_CRON_TOKEN || token !== process.env.INTERNAL_CRON_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, msg: 'wiki-album-scout endpoint healthy. Use POST to run.' })
}
