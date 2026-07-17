'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * NewsMusicPicker — MINIMALUS muzikos pridėjimas inbox'o „Muzika" žingsnyje.
 *
 * 2026-07-17 (v2): rodo TIKRUS DB dainų duomenis (video/cover/užpildymą), NE
 * straipsnio embed'us. Pridėjimas eina per PILNĄ greito-pridėjimo flow
 * (/api/admin/quick-add commit — tikrina/atnaujina esamą dainą, prideda video).
 *
 * Du blokai:
 *   1. „Prie naujienos playerio" — jau pridėtos DB dainos: tikras video thumb +
 *      užpildymo būsena (⚠ be video) + × šalinti.
 *   2. „Pridėti dainą iš YouTube" — viena paieška, seed = [atlikėjas] [main daina];
 *      identifikuotos dainos kaip chip'ai; rezultatas → quick-add commit → daina
 *      atsiranda viršuje (su tikru video).
 */

type Mention = { title: string; artist: string; matched_track_id: number | null; youtube_url: string | null }
type DbTrack = { id: number; title: string; artist_name: string; video_url: string | null; cover_url: string | null; release_year: number | null }
type YtHit = { videoId: string; title: string; channel: string; thumbnail: string; viewCount: number | null }

function ytId(url?: string | null): string | null {
  if (!url) return null
  return url.match(/[?&]v=([^&]+)/)?.[1]
    || url.match(/youtu\.be\/([^?&]+)/)?.[1]
    || url.match(/youtube\.com\/(?:embed|shorts)\/([^?&/]+)/)?.[1]
    || null
}
function ytThumb(url?: string | null): string | null {
  const id = ytId(url)
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
  artistId, artistName, mentions, attachedIds, onAdd, onRemove,
}: {
  artistId: number
  artistName: string
  mentions: Mention[]
  attachedIds: number[]
  onAdd: (trackId: number) => void
  onRemove: (trackId: number) => void
}) {
  const [attached, setAttached] = useState<DbTrack[]>([])
  const [loadingAttached, setLoadingAttached] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YtHit[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [committing, setCommitting] = useState<string | null>(null) // videoId
  const [commitMsg, setCommitMsg] = useState<string | null>(null)
  const didInit = useRef(false)

  const idsKey = attachedIds.join(',')

  // Realūs DB duomenys pridėtoms dainoms.
  useEffect(() => {
    if (attachedIds.length === 0) { setAttached([]); return }
    let cancelled = false
    setLoadingAttached(true)
    fetch(`/api/admin/tracks/by-ids?ids=${encodeURIComponent(idsKey)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setAttached(Array.isArray(d.tracks) ? d.tracks : []) })
      .catch(() => { if (!cancelled) setAttached([]) })
      .finally(() => { if (!cancelled) setLoadingAttached(false) })
    return () => { cancelled = true }
  }, [idsKey, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Seed = [atlikėjas] [MAIN daina]. Main daina = pirma paminėta (svarbiausia).
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const main = mentions[0]?.title
    const seed = main ? `${artistName} ${main}`.trim() : artistName
    setQuery(seed)
    runSearch(seed)
  }, [mentions, artistName, runSearch])

  // + prie YT rezultato → PILNAS quick-add flow (commit). Tikrina/atnaujina
  // esamą dainą (pvz. prideda video Paradise'ui), po to daina atsiranda viršuje.
  const addFromYt = async (hit: YtHit) => {
    setCommitting(hit.videoId)
    setCommitMsg(null)
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${hit.videoId}`, mode: 'commit', overrides: {} }),
      })
      const d = await res.json()
      if (d.ok && d.kind === 'track' && d.track?.id) {
        onAdd(d.track.id)
        setRefreshKey(k => k + 1)
        setCommitMsg(`✓ Pridėta: ${d.track.title}`)
      } else {
        setCommitMsg(`⚠ ${d.error || 'Nepavyko pridėti'}`)
      }
    } catch (e: any) {
      setCommitMsg(`⚠ ${e?.message || 'Klaida'}`)
    } finally {
      setCommitting(null)
    }
  }

  // Identifikuotos naujienos dainos — chip'ai paieškai (be dublikatų).
  const chipTitles = Array.from(new Set(mentions.map(m => m.title).filter(Boolean)))

  // YT rezultatuose neberodom tų, kurie jau pridėti prie DB (surišta pagal
  // YouTube video id iš dainos video_url) — punktas 1.
  const attachedVideoIds = new Set(attached.map(t => ytId(t.video_url)).filter(Boolean) as string[])
  const visibleResults = results.filter(h => !attachedVideoIds.has(h.videoId))

  return (
    <div className="space-y-3">
      {/* ── Prie naujienos playerio (TIKRI DB įrašai) ─────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
          Sistemoje jau esančios dainos {attachedIds.length > 0 && <span className="text-emerald-600">({attachedIds.length})</span>}
        </div>
        {attachedIds.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] italic">Kol kas nepridėta dainų.</p>
        ) : loadingAttached && attached.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">Kraunama…</p>
        ) : (
          <div className="space-y-1.5">
            {attached.map(t => {
              const thumb = ytThumb(t.video_url) || t.cover_url || null
              const hasVideo = !!t.video_url
              return (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-elevated)] p-1.5">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-14 h-9 rounded object-cover bg-black shrink-0" />
                  ) : (
                    <div className="w-14 h-9 rounded bg-black/60 flex items-center justify-center text-white text-sm shrink-0">🎵</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{t.title}</div>
                    <div className="text-[11px] truncate flex items-center gap-1.5">
                      <span className="text-[var(--text-muted)]">{t.artist_name}</span>
                      {hasVideo
                        ? <span className="text-emerald-600">🎬 su video</span>
                        : <span className="text-amber-600">⚠ be video — pridėk iš paieškos žemiau</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => onRemove(t.id)} aria-label="Pašalinti" title="Pašalinti iš naujienos"
                    className="shrink-0 w-6 h-6 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center text-base leading-none">×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Pridėti dainą iš YouTube (pilnas quick-add flow) ────────── */}
      <div>
        <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">🔍 Pridėti dainą iš YouTube</div>
        <div className="flex gap-1 mb-1.5">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(query) } }}
            placeholder={`Ieškoti „${artistName} daina"`}
            className="flex-1 px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[13px] bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-blue-400"
          />
          <button type="button" onClick={() => runSearch(query)} disabled={searching}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[13px] font-medium shrink-0">
            {searching ? '…' : 'Ieškoti'}
          </button>
        </div>
        {chipTitles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mb-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">📰 Naujienoje:</span>
            {chipTitles.slice(0, 6).map((title, i) => (
              <button key={i} type="button"
                onClick={() => { const q = `${artistName} ${title}`.trim(); setQuery(q); runSearch(q) }}
                className="px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[12px] font-medium border border-blue-200">
                {title}
              </button>
            ))}
          </div>
        )}
        {commitMsg && (
          <div className={`text-[12px] mb-1.5 ${commitMsg.startsWith('✓') ? 'text-emerald-600' : 'text-amber-600'}`}>{commitMsg}</div>
        )}
        {searching && visibleResults.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] py-2">Ieškoma…</p>
        ) : visibleResults.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)] py-2">Nieko naujo nerasta — pakeisk paiešką.</p>
        ) : (
          <div className="space-y-1.5">
            {visibleResults.map(hit => {
              const busy = committing === hit.videoId
              return (
                <button key={hit.videoId} type="button" onClick={() => addFromYt(hit)} disabled={!!committing}
                  className="w-full flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-1.5 text-left hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-60">
                  <img src={hit.thumbnail} alt="" className="w-14 h-9 rounded object-cover bg-black shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{hit.title}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {hit.channel}{hit.viewCount ? ` · 👁 ${fmtViews(hit.viewCount)}` : ''}
                    </div>
                  </div>
                  <span className="shrink-0 text-blue-600 text-lg font-bold px-1 w-6 text-center">{busy ? '…' : '＋'}</span>
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
