'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * NewsMusicPicker — muzikos pridėjimas inbox'o „Muzika" žingsnyje.
 *
 * Viršuje: „Sistemoje jau esančios dainos" (tikri DB įrašai + užpildymas + ×).
 * Po juo — sub-tab'ai pridėjimui:
 *   • Dainos    — YouTube paieška (pilnas quick-add commit flow).
 *   • Albumai   — atlikėjo albumai iš DB → prideda visas albumo dainas.
 *   • Atlikėjai — naujienos atlikėjai → prideda visas jų dainas.
 * „Išskleisti į dainas" modelis — albumas/atlikėjas prijungiamas kaip jo dainos.
 */

type Mention = { title: string; artist: string; matched_track_id: number | null; youtube_url: string | null }
type DbTrack = { id: number; title: string; artist_name: string; video_url: string | null; cover_url: string | null; release_year: number | null }
type YtHit = { videoId: string; title: string; channel: string; thumbnail: string; viewCount: number | null }
type ArtistLite = { id: number; name: string }
type AlbumLite = { id: number; title: string; year: number | null; cover_url: string | null; track_ids: number[]; track_count: number }
type MusicAttach = { albums: AlbumLite[]; artist_track_ids: number[] }

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
  artistId, artistName, artists, mentions, attachedIds, onAdd, onRemove,
}: {
  artistId: number
  artistName: string
  artists: ArtistLite[]
  mentions: Mention[]
  attachedIds: number[]
  onAdd: (trackId: number) => void
  onRemove: (trackId: number) => void
}) {
  const [tab, setTab] = useState<'dainos' | 'albumai' | 'atlikejai'>('dainos')
  const [attached, setAttached] = useState<DbTrack[]>([])
  const [loadingAttached, setLoadingAttached] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const idsKey = attachedIds.join(',')
  const attachedSet = new Set(attachedIds)

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

  const bumpRefresh = () => setRefreshKey(k => k + 1)

  return (
    <div className="space-y-3">
      {/* ── Sistemoje jau esančios dainos ─────────────────────────── */}
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
                        : <span className="text-amber-600">⚠ be video</span>}
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

      {/* ── Pridėjimo sub-tab'ai ──────────────────────────────────── */}
      <div>
        <div className="inline-flex rounded-lg border border-[var(--input-border)] overflow-hidden text-[12px] mb-2">
          {([['dainos', '🎵 Dainos'], ['albumai', '💿 Albumai'], ['atlikejai', '🎤 Atlikėjai']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`px-2.5 py-1 font-medium transition-colors ${tab === k ? 'bg-blue-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'dainos' && (
          <DainosTab artistId={artistId} artistName={artistName} mentions={mentions}
            attached={attached} onAdd={onAdd} onCommitted={bumpRefresh} />
        )}
        {tab === 'albumai' && (
          <AlbumaiTab artistId={artistId} attachedSet={attachedSet} onAddMany={ids => { ids.forEach(onAdd); bumpRefresh() }} />
        )}
        {tab === 'atlikejai' && (
          <AtlikejaiTab artists={artists} attachedSet={attachedSet} onAddMany={ids => { ids.forEach(onAdd); bumpRefresh() }} />
        )}
      </div>
    </div>
  )
}

/* ─── Dainos tab: YouTube paieška + quick-add commit ─────────────────── */
function DainosTab({ artistId, artistName, mentions, attached, onAdd, onCommitted }: {
  artistId: number; artistName: string; mentions: Mention[]; attached: DbTrack[]
  onAdd: (id: number) => void; onCommitted: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YtHit[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [committing, setCommitting] = useState<string | null>(null)
  const [commitMsg, setCommitMsg] = useState<string | null>(null)
  const didInit = useRef(false)

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
    } finally { setSearching(false); setLoadingMore(false) }
  }, [artistName])

  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    const main = mentions[0]?.title
    const seed = main ? `${artistName} ${main}`.trim() : artistName
    setQuery(seed)
    runSearch(seed)
  }, [mentions, artistName, runSearch])

  const addFromYt = async (hit: YtHit) => {
    setCommitting(hit.videoId); setCommitMsg(null)
    try {
      const res = await fetch('/api/admin/quick-add', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${hit.videoId}`, mode: 'commit', overrides: {} }),
      })
      const d = await res.json()
      if (d.ok && d.kind === 'track' && d.track?.id) {
        onAdd(d.track.id); onCommitted(); setCommitMsg(`✓ Pridėta: ${d.track.title}`)
      } else setCommitMsg(`⚠ ${d.error || 'Nepavyko pridėti'}`)
    } catch (e: any) { setCommitMsg(`⚠ ${e?.message || 'Klaida'}`) }
    finally { setCommitting(null) }
  }

  const chipTitles = Array.from(new Set(mentions.map(m => m.title).filter(Boolean)))
  const attachedVideoIds = new Set(attached.map(t => ytId(t.video_url)).filter(Boolean) as string[])
  const visibleResults = results.filter(h => !attachedVideoIds.has(h.videoId))

  return (
    <div>
      <div className="flex gap-1 mb-1.5">
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(query) } }}
          placeholder={`Ieškoti „${artistName} daina"`}
          className="flex-1 px-2.5 py-1.5 border border-[var(--input-border)] rounded-lg text-[13px] bg-[var(--bg-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-blue-400" />
        <button type="button" onClick={() => runSearch(query)} disabled={searching}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[13px] font-medium shrink-0">
          {searching ? '…' : 'Ieškoti'}
        </button>
      </div>
      {chipTitles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">📰 Naujienoje:</span>
          {chipTitles.slice(0, 6).map((title, i) => (
            <button key={i} type="button" onClick={() => { const q = `${artistName} ${title}`.trim(); setQuery(q); runSearch(q) }}
              className="px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[12px] font-medium border border-blue-200">{title}</button>
          ))}
        </div>
      )}
      {commitMsg && <div className={`text-[12px] mb-1.5 ${commitMsg.startsWith('✓') ? 'text-emerald-600' : 'text-amber-600'}`}>{commitMsg}</div>}
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
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{hit.channel}{hit.viewCount ? ` · 👁 ${fmtViews(hit.viewCount)}` : ''}</div>
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
  )
}

/* ─── Albumai tab: DB albumai → prideda visas dainas ─────────────────── */
function AlbumaiTab({ artistId, attachedSet, onAddMany }: {
  artistId: number; attachedSet: Set<number>; onAddMany: (ids: number[]) => void
}) {
  const [data, setData] = useState<MusicAttach | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/artists/${artistId}/music-attach`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData({ albums: [], artist_track_ids: [] }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [artistId])

  if (loading) return <p className="text-[13px] text-[var(--text-muted)] py-2">Kraunama…</p>
  const albums = (data?.albums || []).filter(a => a.track_count > 0)
  if (albums.length === 0) return <p className="text-[13px] text-[var(--text-muted)] py-2">Šis atlikėjas neturi albumų su dainomis DB.</p>

  return (
    <div className="space-y-1.5">
      {albums.map(a => {
        const notYet = a.track_ids.filter(id => !attachedSet.has(id))
        const allIn = notYet.length === 0
        return (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-1.5">
            {a.cover_url ? (
              <img src={a.cover_url} alt="" className="w-10 h-10 rounded object-cover bg-black shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-black/50 flex items-center justify-center text-white text-sm shrink-0">💿</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">{a.title}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{a.year ? `${a.year} · ` : ''}{a.track_count} dainos</div>
            </div>
            <button type="button" disabled={allIn} onClick={() => onAddMany(notYet)}
              className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 border border-blue-200">
              {allIn ? '✓ pridėta' : `＋ ${notYet.length} dain.`}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Atlikėjai tab: naujienos atlikėjai → prideda visas jų dainas ───── */
function AtlikejaiTab({ artists, attachedSet, onAddMany }: {
  artists: ArtistLite[]; attachedSet: Set<number>; onAddMany: (ids: number[]) => void
}) {
  const [cache, setCache] = useState<Record<number, number[]>>({})
  const [busy, setBusy] = useState<number | null>(null)

  const addArtist = async (id: number) => {
    setBusy(id)
    try {
      let ids = cache[id]
      if (!ids) {
        const res = await fetch(`/api/admin/artists/${id}/music-attach`)
        const d = await res.json()
        ids = Array.isArray(d.artist_track_ids) ? d.artist_track_ids : []
        setCache(prev => ({ ...prev, [id]: ids! }))
      }
      const notYet = ids.filter(t => !attachedSet.has(t))
      if (notYet.length) onAddMany(notYet)
    } finally { setBusy(null) }
  }

  if (!artists.length) return <p className="text-[13px] text-[var(--text-muted)] py-2">Naujienai nepriskirta atlikėjų.</p>
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-[var(--text-muted)]">Prideda VISAS atlikėjo DB dainas prie naujienos.</p>
      {artists.map(ar => (
        <div key={ar.id} className="flex items-center gap-2 rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] p-1.5">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm shrink-0">🎤</div>
          <div className="flex-1 min-w-0 text-[13px] font-medium text-[var(--text-primary)] truncate">{ar.name}</div>
          <button type="button" disabled={busy === ar.id} onClick={() => addArtist(ar.id)}
            className="shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 border border-blue-200">
            {busy === ar.id ? '…' : '＋ Pridėti dainas'}
          </button>
        </div>
      ))}
    </div>
  )
}
