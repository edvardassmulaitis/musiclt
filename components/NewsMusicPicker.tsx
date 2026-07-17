'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseYtTitleForArtist } from './TrackSuggestPicker'

/**
 * NewsMusicPicker — MINIMALUS muzikos pridėjimas inbox'o „Muzika" žingsnyje.
 *
 * 2026-07-17: pakeitė triukšmingą TrackSuggestPicker inline (embed sekcijos,
 * DB recent/top, wiki importas). Čia TIK du dalykai:
 *   1. Pridėtos dainos (kas eis prie naujienos playerio) — su thumbnail + × šalinti.
 *   2. Pridėjimas iš YouTube — viena paieška, identifikuotos naujienos dainos kaip
 *      chip'ai (click → užpildo paiešką, redaguojama). DB-matched dainos = 1 tap.
 * Jokių kitų šaltinių (embed'ai valdomi Video žingsnyje).
 */

type Mention = {
  title: string
  artist: string
  matched_track_id: number | null
  youtube_url: string | null
}
export type AttachedTrack = { id: number; title: string; artist_name: string; video_url?: string }
type YtHit = { videoId: string; title: string; channel: string; thumbnail: string; viewCount: number | null }

function ytIdFromUrl(url?: string | null): string | null {
  if (!url) return null
  return url.match(/[?&]v=([^&]+)/)?.[1]
    || url.match(/youtu\.be\/([^?&]+)/)?.[1]
    || url.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/)?.[1]
    || null
}
function ytThumb(url?: string | null): string | null {
  const id = ytIdFromUrl(url)
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}
function fmtViews(n: number | null): string {
  if (!n) return ''
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function NewsMusicPicker({
  artistId, artistName, mentions, attached, onAdd, onRemove,
}: {
  artistId: number
  artistName: string
  mentions: Mention[]
  attached: AttachedTrack[]
  onAdd: (t: AttachedTrack) => void
  onRemove: (id: number) => void
}) {
  const [query, setQuery] = useState(artistName)
  const [results, setResults] = useState<YtHit[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [creating, setCreating] = useState<string | null>(null) // videoId
  const didInit = useRef(false)

  const attachedIds = new Set(attached.map(a => a.id))

  const runSearch = useCallback(async (q: string, pageToken: string | null = null) => {
    const query = (q || '').trim() || artistName.trim()
    if (!query) return
    if (pageToken) setLoadingMore(true); else setSearching(true)
    try {
      const url = pageToken
        ? `/api/search/youtube?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(pageToken)}`
        : `/api/search/youtube?q=${encodeURIComponent(query)}`
      const res = await fetch(url)
      const d = await res.json()
      const hits: YtHit[] = Array.isArray(d.results) ? d.results.slice(0, 6) : []
      setResults(prev => pageToken ? [...prev, ...hits] : hits)
      setNextPageToken(d.nextPageToken || null)
    } catch {
      if (!pageToken) { setResults([]); setNextPageToken(null) }
    } finally {
      setSearching(false); setLoadingMore(false)
    }
  }, [artistName])

  // Pirmoji paieška — seed'inam pagal pirmą identifikuotą (nematched) dainą, jei
  // yra; kitaip pagal atlikėją. Tik kartą.
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const firstUnmatched = mentions.find(m => !m.matched_track_id)
    const seed = firstUnmatched ? `${artistName} ${firstUnmatched.title}`.trim() : artistName
    setQuery(seed)
    runSearch(seed)
  }, [mentions, artistName, runSearch])

  const addFromYt = async (hit: YtHit) => {
    setCreating(hit.videoId)
    try {
      const cleanTitle = parseYtTitleForArtist(hit.title, artistName) || hit.title
      const res = await fetch('/api/admin/tracks/quick-create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          artist_id: artistId,
          youtube_url: `https://www.youtube.com/watch?v=${hit.videoId}`,
        }),
      })
      const d = await res.json()
      if (res.ok && d.track_id) {
        onAdd({ id: d.track_id, title: d.title || cleanTitle, artist_name: d.artist_name || artistName, video_url: d.youtube_url || `https://www.youtube.com/watch?v=${hit.videoId}` })
      }
    } finally {
      setCreating(null)
    }
  }

  const addFromDb = (m: Mention) => {
    if (!m.matched_track_id) return
    onAdd({ id: m.matched_track_id, title: m.title, artist_name: m.artist || artistName, video_url: m.youtube_url || undefined })
  }

  // Identifikuotos dainos, kurių DAR nėra pridėta — kaip pridėjimo pasiūlymai.
  const matchedMentions = mentions.filter(m => m.matched_track_id && !attachedIds.has(m.matched_track_id))
  const searchChips = mentions.filter(m => !m.matched_track_id)

  return (
    <div className="space-y-3">
      {/* ── Pridėtos dainos ─────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Prie naujienos playerio {attached.length > 0 && <span className="text-emerald-600">({attached.length})</span>}
        </div>
        {attached.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] italic">Kol kas nepridėta dainų.</p>
        ) : (
          <div className="space-y-1.5">
            {attached.map(t => {
              const thumb = ytThumb(t.video_url)
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] p-1.5">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-14 h-9 rounded object-cover bg-black shrink-0" />
                  ) : (
                    <div className="w-14 h-9 rounded bg-black/70 flex items-center justify-center text-white text-sm shrink-0">🎵</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">{t.artist_name}</div>
                  </div>
                  <button type="button" onClick={() => onRemove(t.id)} aria-label="Pašalinti" title="Pašalinti"
                    className="shrink-0 w-6 h-6 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center text-base leading-none">×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── DB match'ai iš naujienos — 1 tap pridėti ───────────────── */}
      {matchedMentions.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Rasta kataloge</div>
          {matchedMentions.map((m, i) => (
            <button key={i} type="button" onClick={() => addFromDb(m)}
              className="w-full flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-left hover:bg-emerald-100">
              {ytThumb(m.youtube_url) ? (
                <img src={ytThumb(m.youtube_url)!} alt="" className="w-14 h-9 rounded object-cover bg-black shrink-0" />
              ) : (
                <div className="w-14 h-9 rounded bg-emerald-600/80 flex items-center justify-center text-white text-sm shrink-0">🎵</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-emerald-900 truncate">{m.title}</div>
                <div className="text-[11px] text-emerald-700">Jau kataloge — spausk pridėti</div>
              </div>
              <span className="shrink-0 text-emerald-700 text-lg font-bold px-1">＋</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Pridėjimas iš YouTube ──────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">🔍 Pridėti dainą iš YouTube</div>
        <div className="flex gap-1 mb-1.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(query) } }}
            placeholder={`Ieškoti „${artistName} ..."`}
            className="flex-1 px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[13px] bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-blue-400"
          />
          <button type="button" onClick={() => runSearch(query)} disabled={searching}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[13px] font-medium shrink-0">
            {searching ? '…' : 'Ieškoti'}
          </button>
        </div>
        {/* Identifikuotos naujienos dainos — click užpildo paiešką (redaguojama) */}
        {searchChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">📰 Naujienoje:</span>
            {searchChips.slice(0, 6).map((m, i) => (
              <button key={i} type="button"
                onClick={() => { const q = `${artistName} ${m.title}`.trim(); setQuery(q); runSearch(q) }}
                className="px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[12px] font-medium border border-blue-200">
                {m.title}
              </button>
            ))}
          </div>
        )}
        {/* Rezultatai */}
        {searching && results.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] py-2">Ieškoma…</p>
        ) : results.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] py-2">Nieko nerasta — pakeisk paiešką.</p>
        ) : (
          <div className="space-y-1.5">
            {results.map(hit => {
              const busy = creating === hit.videoId
              return (
                <button key={hit.videoId} type="button" onClick={() => addFromYt(hit)} disabled={!!creating}
                  className="w-full flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-1.5 text-left hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-60">
                  <img src={hit.thumbnail} alt="" className="w-14 h-9 rounded object-cover bg-black shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{hit.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {hit.channel}{hit.viewCount ? ` · 👁 ${fmtViews(hit.viewCount)}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0 text-blue-600 text-lg font-bold px-1">{busy ? '…' : '＋'}</span>
                </button>
              )
            })}
            {nextPageToken && (
              <button type="button" onClick={() => runSearch(query, nextPageToken)} disabled={loadingMore}
                className="w-full py-1.5 text-[12px] text-blue-600 hover:bg-blue-50 rounded-lg font-medium">
                {loadingMore ? '…' : '+ Rodyti daugiau'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
