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
  const [ytSearchQ, setYtSearchQ] = useState(initialQuery || '')
  const [ytSearching, setYtSearching] = useState(false)
  const [ytResults, setYtResults] = useState<YtSearchHit[]>([])
  const [selected, setSelected] = useState<SelectedRow[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualYtUrl, setManualYtUrl] = useState('')
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

  // YT live search
  const runYtSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setYtResults([]); return }
    setYtSearching(true)
    try {
      const fullQuery = `${artistName} ${query}`.trim()
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(fullQuery)}`)
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
    // Auto-trigger YT search jei initialQuery yra (pvz., „Spręsti" su mention.title)
    if (initialQuery && !initialSearchDone.current) {
      initialSearchDone.current = true
      runYtSearch(initialQuery)
    }
  }, [load, runYtSearch, initialQuery])

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
        {/* ── AI mentions (jei yra) ─────────────────────────────── */}
        {aiMentions.length > 0 && (
          <SectionTight title="🤖 Iš naujienos teksto" count={aiMentions.length}>
            {aiMentions.map((m, i) => {
              const key = `ai-${i}`
              const matched = m.matched_track_id ?? null
              const alreadyIn = isAlreadyIn(matched ?? undefined)
              const row: SelectedRow = matched
                ? {
                    key, track_id: matched, title: m.title, artist_name: m.artist || artistName,
                    video_url: null, source: 'ai_mention', ai_mention_idx: i,
                  }
                : {
                    key, title: m.title, artist_name: m.artist || artistName,
                    video_url: m.youtube_url || null, source: 'ai_mention', ai_mention_idx: i,
                    to_create: { title: m.title, ytUrl: m.youtube_url },
                  }
              return (
                <Row
                  key={key}
                  title={m.title}
                  subtitle={matched ? '✓ DB' : (m.youtube_url ? '🎬 YT iš teksto' : 'ne DB')}
                  badge={matched ? 'db' : 'ai'}
                  selected={isSelected(key) || alreadyIn}
                  disabled={alreadyIn}
                  onToggle={() => !alreadyIn && toggleSelected(row)}
                  onTitleClick={() => { setYtSearchQ(m.title); runYtSearch(m.title) }}
                />
              )
            })}
          </SectionTight>
        )}

        {/* ── Article YT embeds (mostly the actual subject) ────── */}
        {!loading && data && data.yt_embeds.length > 0 && (
          <SectionTight title="🎬 Straipsnio embed video" count={data.yt_embeds.length}>
            {data.yt_embeds.map(yt => {
              const key = `emb-${yt.video_id}`
              const row: SelectedRow = {
                key, title: yt.title, artist_name: artistName,
                video_url: yt.url, source: 'yt_embed',
                to_create: { title: yt.title, ytUrl: yt.url },
              }
              return (
                <RowWithThumb
                  key={key}
                  thumb={yt.thumb}
                  title={yt.title}
                  subtitle={`${formatViews(yt.views)} · ${yt.uploaded_at ? new Date(yt.uploaded_at).getFullYear() : '—'}`}
                  badge="embed"
                  selected={isSelected(key)}
                  onToggle={() => toggleSelected(row)}
                />
              )
            })}
          </SectionTight>
        )}

        {/* ── YT live search ─────────────────────────────────────── */}
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
          {ytResults.length === 0 && !ytSearching && (
            <p className="text-[10px] text-gray-400 italic px-1">Pateik užklausą — pamatysi top 5 YT video.</p>
          )}
          {ytResults.map(r => {
            const key = `yts-${r.videoId}`
            const url = `https://www.youtube.com/watch?v=${r.videoId}`
            const row: SelectedRow = {
              key, title: r.title, artist_name: artistName,
              video_url: url, source: 'yt_search',
              to_create: { title: r.title, ytUrl: url },
            }
            return (
              <RowWithThumb
                key={key}
                thumb={r.thumbnail}
                title={r.title}
                subtitle={r.channel}
                badge="yt"
                selected={isSelected(key)}
                onToggle={() => toggleSelected(row)}
              />
            )
          })}
        </SectionTight>

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

        {/* ── DB recent ──────────────────────────────────────────── */}
        {!loading && data && data.db_recent.length > 0 && (
          <CollapsibleSection title="🆕 Naujausi DB" count={data.db_recent.length}>
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

        {/* ── DB top ──────────────────────────────────────────── */}
        {!loading && data && data.db_top.length > 0 && (
          <CollapsibleSection title="⭐ Top DB" count={data.db_top.length}>
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

        {/* ── Manual ─────────────────────────────────────────────── */}
        <CollapsibleSection title="✏️ Įvesti rankiniu" count={null} defaultOpen={false}>
          <div className="space-y-1">
            <input
              type="text"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="Pavadinimas..."
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800"
            />
            <input
              type="url"
              value={manualYtUrl}
              onChange={e => setManualYtUrl(e.target.value)}
              placeholder="YouTube URL (neprivaloma)"
              className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white text-gray-800"
            />
            <button
              type="button"
              onClick={() => {
                if (!manualTitle.trim()) return
                const key = `manual-${Date.now()}`
                toggleSelected({
                  key, title: manualTitle.trim(), artist_name: artistName,
                  video_url: manualYtUrl || null, source: 'manual',
                  to_create: { title: manualTitle.trim(), ytUrl: manualYtUrl || null },
                })
                setManualTitle('')
                setManualYtUrl('')
              }}
              disabled={!manualTitle.trim()}
              className="w-full px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-bold">
              + Pridėti į pasirinkimus
            </button>
          </div>
        </CollapsibleSection>

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
          {submitting ? '...' : totalToProcess > 0 ? `✓ Pridėti ${totalToProcess}` : 'Nieko nepasirinkta'}
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
  thumb: string; title: string; subtitle: string; badge: 'embed' | 'yt'
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
