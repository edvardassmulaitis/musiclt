'use client'

/**
 * TrackSuggestPicker — pilnas track management modal'as.
 *
 * Funkcijos:
 *   - YT live search (auto-trigger on open jei initialQuery)
 *   - Article'o YT embeds (highest priority — kas yra straipsnyje)
 *   - AI mentions (su matched status badge'ais)
 *   - DB recent / top fallback'ai
 *   - Wiki recent singles
 *   - Manual create
 *
 * Selected state'as PERSISTS modal'e — user'is pridėda kelias dainas, paspaudžia
 * apatinį „Pridėti N dainas" — visos paduodamos vienu callback'u.
 *
 * Compact UI: 28-32px row height, source badges per row, status indicators.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import FullscreenModal from '@/components/ui/FullscreenModal'
import WikipediaImportDiscography from '@/components/WikipediaImportDiscography'

type DbTrack = {
  track_id: number
  title: string
  video_url: string | null
  score: number | null
  release_year: number | null
}

type YtEmbedTrack = {
  video_id: string
  title: string
  views: number | null
  uploaded_at: string | null
  thumb: string
  url: string
}

type WikiSingle = { title: string; year: number | null }

type AiMention = {
  title: string
  artist: string
  matched_track_id: number | null
  youtube_url: string | null
}

type Suggestions = {
  artist: { id: number; name: string; slug: string }
  q: string
  db_matches: DbTrack[]
  db_recent: DbTrack[]
  db_top: DbTrack[]
  yt_embeds: YtEmbedTrack[]
  wiki_singles: WikiSingle[]
  errors?: { wiki?: string }
}

type YtSearchHit = {
  videoId: string
  title: string
  channel: string
  thumbnail: string
  publishedAt: string
  viewCount: number | null
}

/**
 * Parse YT video title — atskiria pagrindinio atlikėjo prefix'ą, paliekant
 * dainos pavadinimą + feat. info (jei turi). Reikia, kad track'as DB'oje
 * būtų išsaugotas TIK su tikru pavadinimu, ne kaip „DRAKE - WHAT DID I MISS".
 *
 * Examples:
 *   "DRAKE - WHAT DID I MISS"           + "Drake"  → "WHAT DID I MISS"
 *   "Drake - Ran to Atlanta ft. Future" + "Drake"  → "Ran to Atlanta ft. Future"
 *   "Drake – Iceman (Official Video)"   + "Drake"  → "Iceman"
 *   "DRAKE: Habibti [Visualizer]"       + "Drake"  → "Habibti"
 *   "Bad Bunny - Monaco"                + "Drake"  → "Bad Bunny - Monaco" (ne match'as)
 */
export function parseYtTitleForArtist(rawTitle: string, primaryArtistName: string): string {
  let t = (rawTitle || '').trim()
  if (!t) return ''

  // 1. Drop common YT suffixes (Official Video, Lyric Video, Audio, etc.)
  const dropPatterns = [
    /\s*[\(\[]\s*official\s*(music\s*)?(video|audio)\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*official\s*(lyric|visualizer)\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*lyric\s*video\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*lyrics\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*audio\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*visualizer\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*hd\s*[\)\]]\s*$/i,
    /\s*[\(\[]\s*4k\s*[\)\]]\s*$/i,
    /\s*\|\s*(official\s*(music\s*)?video|audio|visualizer)\s*$/i,
  ]
  for (const p of dropPatterns) t = t.replace(p, '').trim()

  // 2. Drop "Artist - " or "Artist – " or "ARTIST: " prefix (case-insensitive)
  if (primaryArtistName) {
    const artistEsc = primaryArtistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const prefixRe = new RegExp(`^${artistEsc}\\s*[-–—:]\\s*`, 'i')
    t = t.replace(prefixRe, '').trim()
  }

  return t || rawTitle
}

/**
 * Normalize title for duplicate detection — drop diacritics, lowercase,
 * strip leading/trailing whitespace + common YT noise.
 */
function normalizeTitle(t: string): string {
  return (t || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '') // drop bracketed annotations
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Surask DB track'ą su panašiu pavadinimu — naudojama duplicate prevention
 * (kai user'is pasirenka YT video, perspėjam, kad jau yra DB'oje).
 */
function findDbDup(ytTitle: string, dbTracks: DbTrack[]): DbTrack | null {
  const yt = normalizeTitle(ytTitle)
  if (!yt || yt.length < 3) return null
  for (const t of dbTracks) {
    const db = normalizeTitle(t.title)
    if (!db) continue
    // Exact match arba YT title contain'ina DB pavadinimą (su ≥3 chars)
    if (db === yt || (db.length >= 3 && yt.includes(db)) || (yt.length >= 3 && db.includes(yt))) {
      return t
    }
  }
  return null
}

/**
 * "Prieš X" formatas iš ISO date'o (santykinis laikas LT'iškai).
 * Tinkamas LT linksniavimas pagal skaičių.
 */
function timeAgo(isoDate: string): string {
  if (!isoDate) return ''
  const ms = Date.now() - new Date(isoDate).getTime()
  if (ms < 0) return ''
  const d = Math.floor(ms / 86_400_000)
  if (d === 0) return 'Šiandien'
  if (d === 1) return 'Vakar'
  if (d < 7) return `Prieš ${d} dienas`
  if (d < 14) return 'Prieš savaitę'
  if (d < 30) return `Prieš ${Math.floor(d / 7)} savaites`
  if (d < 60) return 'Prieš mėnesį'
  if (d < 365) return `Prieš ${Math.floor(d / 30)} mėnesius`
  const yrs = Math.floor(d / 365)
  if (yrs === 1) return 'Prieš metus'
  return `Prieš ${yrs} metus`
}

/**
 * LT pluralization helper — kaip skambės „X dainos / dainų / dainas".
 *   1   → daina
 *   2-9 → dainos
 *   ≥10 → dainų
 *   suffix'ai pagal paskutinį dešimtainį (kaip wiki-disco import'e)
 */
function plLt(count: number, sg: string, pl_2_9: string, pl_10: string): string {
  const last = count % 10
  const last2 = count % 100
  if (last === 1 && last2 !== 11) return `${count} ${sg}`
  if (last >= 2 && last <= 9 && (last2 < 12 || last2 > 19)) return `${count} ${pl_2_9}`
  return `${count} ${pl_10}`
}

export type PickResult = {
  track_id: number
  title: string
  artist_name: string
  video_url?: string | null
  already_existed?: boolean
}

type SelectedRow = {
  key: string                 // unique row id
  track_id?: number           // jei DB existing
  title: string
  artist_name: string
  video_url: string | null
  source: 'db' | 'yt_embed' | 'yt_search' | 'wiki' | 'manual' | 'ai_mention'
  ai_mention_idx?: number     // jei kilo iš AI mention
  to_create?: { title: string; ytUrl: string | null }  // dar nesukurta DB'oje
}

export default function TrackSuggestPicker({
  artistId, artistName, initialQuery, embedUrls = [],
  aiMentions = [],
  alreadySelectedIds = [],
  onPickMany, onClose,
}: {
  artistId: number
  artistName: string
  initialQuery?: string
  embedUrls?: string[]
  aiMentions?: AiMention[]
  alreadySelectedIds?: number[]
  onPickMany: (results: PickResult[]) => void
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Suggestions | null>(null)
  // Default search input = artist name (jei nera initialQuery) → user mato kas
  // ieskoma, gali edit'inti / extend'inti. Search siunčia input kaip-yra (be
  // prepend'o), kad nebūtų „Drake Drake" tipo dublikacijos.
  const [ytSearchQ, setYtSearchQ] = useState(initialQuery ? `${artistName} ${initialQuery}` : artistName)
  const [ytSearching, setYtSearching] = useState(false)
  const [ytResults, setYtResults] = useState<YtSearchHit[]>([])
  const [selected, setSelected] = useState<SelectedRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const initialSearchDone = useRef(false)

  // Load suggestions (DB + embeds + wiki)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (initialQuery) params.set('q', initialQuery)
      for (const u of embedUrls) params.append('embed_url', u)
      const res = await fetch(`/api/admin/artists/${artistId}/track-suggestions?${params}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [artistId, initialQuery, embedUrls])

  // YT live search. Naudoja query as-is — input'as jau prefilled su artist'o
  // pavadinimu, user'is gali pridėt dainos pavadinimą („Drake Iceman").
  const runYtSearch = useCallback(async (query: string) => {
    setYtSearching(true)
    try {
      const q = query.trim() || artistName.trim()
      if (!q) { setYtResults([]); return }
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`)
      const d = await res.json()
      setYtResults(Array.isArray(d.results) ? d.results.slice(0, 5) : [])
    } catch {
      setYtResults([])
    } finally {
      setYtSearching(false)
    }
  }, [artistName])

  useEffect(() => {
    load()
    // Auto-trigger YT search — naudoja ytSearchQ (jau prefilled su artist
    // name arba „artist initialQuery")
    if (!initialSearchDone.current) {
      initialSearchDone.current = true
      runYtSearch(ytSearchQ)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, runYtSearch])

  // ── Selection helpers ────────────────────────────────────────────
  const toggleSelected = (row: SelectedRow) => {
    setSelected(prev => {
      const exists = prev.find(s => s.key === row.key)
      if (exists) return prev.filter(s => s.key !== row.key)
      return [...prev, row]
    })
  }
  const isSelected = (key: string) => selected.some(s => s.key === key)
  const isAlreadyIn = (track_id?: number) => !!track_id && alreadySelectedIds.includes(track_id)

  // ── Submit: quick-create needed rows + collect results ───────────
  const handleSubmit = async () => {
    if (selected.length === 0) return
    setSubmitting(true)
    const results: PickResult[] = []
    try {
      for (const s of selected) {
        if (s.track_id) {
          // Existing DB track
          results.push({
            track_id: s.track_id,
            title: s.title,
            artist_name: s.artist_name,
            video_url: s.video_url,
            already_existed: true,
          })
        } else if (s.to_create) {
          // Quick-create
          const res = await fetch('/api/admin/tracks/quick-create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: s.to_create.title,
              artist_id: artistId,
              youtube_url: s.to_create.ytUrl,
            }),
          })
          const d = await res.json()
          if (res.ok) {
            results.push({
              track_id: d.track_id, title: d.title, artist_name: d.artist_name,
              video_url: d.youtube_url || s.to_create.ytUrl,
              already_existed: !!d.already_existed,
            })
          }
        }
      }
      onPickMany(results)
    } finally {
      setSubmitting(false)
    }
  }

  // ── UI ───────────────────────────────────────────────────────────
  const totalToProcess = selected.length

  return (
    <FullscreenModal
      onClose={onClose}
      title={`🎵 ${artistName}: dainos`}
      maxWidth="max-w-2xl"
      noPadding
    >
      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2 bg-gray-50">
        {/* ── Wiki disco import banner — kai DB tracks < 5 ───────── */}
        {!loading && data && (() => {
          const dbCount = (data.db_recent?.length || 0) + (data.db_top?.length || 0)
          if (dbCount >= 5) return null
          return (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 flex items-center justify-between gap-2">
              <div className="text-xs text-purple-800 flex-1">
                <strong>📚 {dbCount === 0 ? 'Nėra dainų DB' : `Tik ${dbCount} dainos DB`}.</strong>
                <span className="block opacity-80 mt-0.5">Importuok diskografiją iš Wikipedia — atsiras visi albumai + dainos.</span>
              </div>
              <WikipediaImportDiscography
                artistId={artistId}
                artistName={artistName}
                isSolo={true}
                buttonClassName="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-semibold whitespace-nowrap"
                buttonLabel="📥 Importuoti"
                onClose={() => { load() }}
              />
            </div>
          )
        })()}

        {/* ── YT live search (FIRST — primary source) ────────────── */}
        <SectionTight title="🔍 YouTube paieška" count={null}>
          <div className="flex gap-1 mb-1">
            <input
              type="text"
              value={ytSearchQ}
              onChange={e => setYtSearchQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runYtSearch(ytSearchQ) } }}
              placeholder={`Ieškoti „${artistName} ..."`}
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800"
            />
            <button
              type="button"
              onClick={() => runYtSearch(ytSearchQ)}
              disabled={ytSearching}
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium">
              {ytSearching ? '...' : 'Ieškoti'}
            </button>
          </div>
          {/* AI extracted titles iš naujienos teksto — click triggerina YT paiešką tos dainos */}
          {aiMentions.length > 0 && (() => {
            const unmatched = aiMentions.filter(m => !m.matched_track_id)
            if (unmatched.length === 0) return null
            return (
              <div className="flex flex-wrap gap-1 mb-1 px-0.5">
                <span className="text-[10px] text-gray-500 self-center">📰 Naujienoje paminėtos:</span>
                {unmatched.slice(0, 6).map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const q = `${artistName} ${m.title}`.trim()
                      setYtSearchQ(q)
                      runYtSearch(q)
                    }}
                    title={`Ieškoti „${m.title}" YouTube'e`}
                    className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium border border-dashed border-blue-300">
                    {m.title}
                  </button>
                ))}
              </div>
            )
          })()}
          {ytResults.length === 0 && !ytSearching && (
            <p className="text-[10px] text-gray-400 italic px-1">Nieko nerasta. Pakeisk paieškos užklausą.</p>
          )}
          {ytSearching && (
            <div className="flex justify-center py-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {ytResults.map(r => {
            const key = `yts-${r.videoId}`
            const url = `https://www.youtube.com/watch?v=${r.videoId}`
            // Parse YT title - atimam atlikėjo prefix'ą
            const cleanTitle = parseYtTitleForArtist(r.title, artistName)
            const ago = timeAgo(r.publishedAt)
            const viewsStr = r.viewCount ? formatViews(r.viewCount) : ''
            // Duplicate detection — patikrinam ar yra DB track'as su panašiu title
            const allDbTracks = [
              ...(data?.db_matches || []),
              ...(data?.db_recent || []),
              ...(data?.db_top || []),
            ]
            const dup = findDbDup(cleanTitle, allDbTracks)
            const dupKey = dup ? `dbm-${dup.track_id}` : null
            const subtitle = dup
              ? `⚠ JAU DB: „${dup.title}" — pažymėk ją vietoj YT`
              : [r.channel, viewsStr, ago].filter(Boolean).join(' · ')
            const row: SelectedRow = {
              key, title: cleanTitle, artist_name: artistName,
              video_url: url, source: 'yt_search',
              to_create: { title: cleanTitle, ytUrl: url },
            }
            return (
              <RowWithThumb
                key={key}
                thumb={r.thumbnail}
                title={cleanTitle}
                subtitle={subtitle}
                badge={dup ? 'db' : 'yt'}
                selected={isSelected(key) || (!!dup && isSelected(dupKey!))}
                onToggle={() => {
                  // Jei rastas DB dup — paspaudus YT row'ą, vietoj YT pridedam
                  // existing DB track'ą (selectinam jo key)
                  if (dup) {
                    toggleSelected({
                      key: `dbm-${dup.track_id}`,
                      track_id: dup.track_id,
                      title: dup.title,
                      artist_name: artistName,
                      video_url: dup.video_url,
                      source: 'db',
                    })
                  } else {
                    toggleSelected(row)
                  }
                }}
              />
            )
          })}
        </SectionTight>

        {/* ── Article YT embeds (highest priority — actual news subject) ── */}
        {!loading && data && data.yt_embeds.length > 0 && (
          <SectionTight title="🎬 Straipsnio embed video" count={data.yt_embeds.length}>
            {data.yt_embeds.map(yt => {
              const key = `emb-${yt.video_id}`
              const cleanTitle = parseYtTitleForArtist(yt.title, artistName)
              const ago = yt.uploaded_at ? timeAgo(yt.uploaded_at) : ''
              const viewsStr = yt.views ? formatViews(yt.views) : ''
              const subtitle = [viewsStr, ago].filter(Boolean).join(' · ')
              const row: SelectedRow = {
                key, title: cleanTitle, artist_name: artistName,
                video_url: yt.url, source: 'yt_embed',
                to_create: { title: cleanTitle, ytUrl: yt.url },
              }
              return (
                <RowWithThumb
                  key={key}
                  thumb={yt.thumb}
                  title={cleanTitle}
                  subtitle={subtitle || '—'}
                  badge="embed"
                  selected={isSelected(key)}
                  onToggle={() => toggleSelected(row)}
                />
              )
            })}
          </SectionTight>
        )}

        {/* ── AI mentions kurie JAU yra DB ────────────────────────
           Unmatched mentions persikėlė į YT search pills (žr. aukščiau).
           Politika: track'as kuriamas TIK su YT video. */}
        {aiMentions.length > 0 && (() => {
          const matched = aiMentions.filter(m => m.matched_track_id)
          if (matched.length === 0) return null
          return (
            <SectionTight title="✓ DB jau turi (paminėta straipsnyje)" count={matched.length}>
              {matched.map((m, i) => {
                const key = `aim-${i}`
                const alreadyIn = isAlreadyIn(m.matched_track_id ?? undefined)
                const row: SelectedRow = {
                  key, track_id: m.matched_track_id!, title: m.title, artist_name: m.artist || artistName,
                  video_url: null, source: 'ai_mention', ai_mention_idx: i,
                }
                return (
                  <Row
                    key={key}
                    title={m.title}
                    subtitle={m.artist || artistName}
                    badge="db"
                    selected={isSelected(key) || alreadyIn}
                    disabled={alreadyIn}
                    onToggle={() => !alreadyIn && toggleSelected(row)}
                  />
                )
              })}
            </SectionTight>
          )
        })()}

        {/* ── DB matches (jei q) ────────────────────────────────── */}
        {!loading && data && data.db_matches.length > 0 && (
          <SectionTight title={`🎯 Mūsų DB: „${data.q}"`} count={data.db_matches.length}>
            {data.db_matches.map(t => {
              const key = `dbm-${t.track_id}`
              const alreadyIn = isAlreadyIn(t.track_id)
              const row: SelectedRow = {
                key, track_id: t.track_id, title: t.title, artist_name: artistName,
                video_url: t.video_url, source: 'db',
              }
              return (
                <Row
                  key={key}
                  title={t.title}
                  subtitle={`${t.release_year || '—'} · ${t.video_url ? '🎬' : 'no YT'}`}
                  badge="db"
                  selected={isSelected(key) || alreadyIn}
                  disabled={alreadyIn}
                  onToggle={() => !alreadyIn && toggleSelected(row)}
                />
              )
            })}
          </SectionTight>
        )}

        {/* ── DB recent (expanded by default — prevent duplicates) ─ */}
        {!loading && data && data.db_recent.length > 0 && (
          <CollapsibleSection title="🆕 Naujausi DB" count={data.db_recent.length} defaultOpen={true}>
            {data.db_recent.map(t => {
              const key = `dbr-${t.track_id}`
              const alreadyIn = isAlreadyIn(t.track_id)
              const row: SelectedRow = {
                key, track_id: t.track_id, title: t.title, artist_name: artistName,
                video_url: t.video_url, source: 'db',
              }
              return (
                <Row
                  key={key} title={t.title}
                  subtitle={`${t.release_year || '—'} · 🎬`}
                  badge="db"
                  selected={isSelected(key) || alreadyIn}
                  disabled={alreadyIn}
                  onToggle={() => !alreadyIn && toggleSelected(row)}
                />
              )
            })}
          </CollapsibleSection>
        )}

        {/* ── DB top (expanded — leidžiam matyti visus su video) ── */}
        {!loading && data && data.db_top.length > 0 && (
          <CollapsibleSection title="⭐ Top DB" count={data.db_top.length} defaultOpen={true}>
            {data.db_top.map(t => {
              const key = `dbt-${t.track_id}`
              const alreadyIn = isAlreadyIn(t.track_id)
              const row: SelectedRow = {
                key, track_id: t.track_id, title: t.title, artist_name: artistName,
                video_url: t.video_url, source: 'db',
              }
              return (
                <Row
                  key={key} title={t.title}
                  subtitle={`score ${t.score} · 🎬`}
                  badge="db"
                  selected={isSelected(key) || alreadyIn}
                  disabled={alreadyIn}
                  onToggle={() => !alreadyIn && toggleSelected(row)}
                />
              )
            })}
          </CollapsibleSection>
        )}

        {/* ── Wiki ──────────────────────────────────────────────── */}
        {!loading && data && data.wiki_singles.length > 0 && (
          <CollapsibleSection title="📖 Wikipedia singlai" count={data.wiki_singles.length}>
            {data.wiki_singles.map((w, i) => {
              const key = `wiki-${i}-${w.title}`
              const row: SelectedRow = {
                key, title: w.title, artist_name: artistName,
                video_url: null, source: 'wiki',
                to_create: { title: w.title, ytUrl: null },
              }
              return (
                <Row
                  key={key} title={w.title}
                  subtitle={String(w.year || '—')}
                  badge="wiki"
                  selected={isSelected(key)}
                  onToggle={() => toggleSelected(row)}
                />
              )
            })}
          </CollapsibleSection>
        )}

        {/* Manual create (be YT) — visiškai pašalintas. Politika: track'as kuriamas
           TIK kai turi YT video. Jei nėra YT — naudok paiešką arba Wiki disco. */}

        {loading && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom sticky bar */}
      <div className="px-3 py-2 border-t border-gray-200 bg-white flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded text-xs hover:bg-gray-100">
          Atšaukti
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={totalToProcess === 0 || submitting}
          className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-bold">
          {submitting
            ? '...'
            : totalToProcess > 0
              ? `✓ Pridėti ${plLt(totalToProcess, 'dainą', 'dainas', 'dainų')} prie „${artistName}"`
              : 'Nieko nepasirinkta'}
        </button>
      </div>
    </FullscreenModal>
  )
}

// ─── Compact components ─────────────────────────────────────────

function SectionTight({ title, count, children }: { title: string; count: number | null; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-2 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
        {title}{count !== null && <span className="ml-1 opacity-60">({count})</span>}
      </div>
      <div className="p-1 space-y-0.5">{children}</div>
    </div>
  )
}

function CollapsibleSection({ title, count, children, defaultOpen = false }: {
  title: string; count: number | null; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-2 py-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wide bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <span>{title}{count !== null && <span className="ml-1 opacity-60">({count})</span>}</span>
        <span className="text-gray-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="p-1 space-y-0.5">{children}</div>}
    </div>
  )
}

function Badge({ type }: { type: 'db' | 'ai' | 'embed' | 'yt' | 'wiki' | 'manual' }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    db:     { label: 'DB',     cls: 'bg-emerald-100 text-emerald-700' },
    ai:     { label: 'AI',     cls: 'bg-blue-50 text-blue-700' },
    embed:  { label: 'EMBED',  cls: 'bg-amber-100 text-amber-800' },
    yt:     { label: 'YT',     cls: 'bg-red-50 text-red-600' },
    wiki:   { label: 'WIKI',   cls: 'bg-purple-50 text-purple-700' },
    manual: { label: 'MANUAL', cls: 'bg-gray-100 text-gray-700' },
  }
  const c = cfg[type]
  return <span className={`px-1 py-0 rounded text-[9px] font-bold ${c.cls}`}>{c.label}</span>
}

function Row({ title, subtitle, badge, selected, disabled = false, onToggle, onTitleClick }: {
  title: string; subtitle: string; badge: 'db' | 'ai' | 'embed' | 'yt' | 'wiki' | 'manual'
  selected: boolean; disabled?: boolean; onToggle: () => void; onTitleClick?: () => void
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs ${
        disabled ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50'
      } ${selected ? 'bg-emerald-50' : ''}`}
      onClick={() => !disabled && onToggle()}
    >
      <input type="checkbox" readOnly checked={selected} disabled={disabled} className="w-3.5 h-3.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div
          className="font-medium text-gray-800 truncate"
          onClick={(e) => { if (onTitleClick) { e.stopPropagation(); onTitleClick() } }}
          title={onTitleClick ? 'Click → ieškoti YT' : undefined}>
          {title}
        </div>
        <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>
      </div>
      <Badge type={badge} />
    </div>
  )
}

function RowWithThumb({ thumb, title, subtitle, badge, selected, onToggle }: {
  thumb: string; title: string; subtitle: string; badge: 'embed' | 'yt' | 'db'
  selected: boolean; onToggle: () => void
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs cursor-pointer hover:bg-blue-50 ${
        selected ? 'bg-emerald-50' : ''
      }`}
      onClick={onToggle}
    >
      <input type="checkbox" readOnly checked={selected} className="w-3.5 h-3.5 shrink-0" />
      <img src={thumb} alt="" className="w-10 h-7 object-cover rounded shrink-0 bg-gray-200" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-800 truncate">{title}</div>
        <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>
      </div>
      <Badge type={badge} />
    </div>
  )
}

function formatViews(n: number | null): string {
  if (!n) return ''
  if (n >= 1_000_000_000) return `👁 ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `👁 ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `👁 ${(n / 1_000).toFixed(0)}K`
  return `👁 ${n}`
}
