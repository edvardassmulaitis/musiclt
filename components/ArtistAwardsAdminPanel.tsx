'use client'

/**
 * Admin per-artist Awards listing.
 *
 * Shows existing awards (from voting_participants imported_from_award) grouped
 * by channel. Completeness indicator: event with only 1 participant means
 * the ceremony was imported from this artist's article only — co-nominees
 * not yet imported.
 */

import { useEffect, useState, useCallback } from 'react'

type Row = {
  id: number
  result: string
  work: string | null
  event_id: number
  event_name: string
  event_slug: string
  edition_year: number | null
  channel_name: string
  channel_slug: string
  participants_in_event: number
}

const RESULT_META: Record<string, { label: string; bg: string; fg: string }> = {
  won:        { label: 'Laimėjo',     bg: '#dcfce7', fg: '#166534' },
  nominated:  { label: 'Nominuotas',  bg: '#dbeafe', fg: '#1e40af' },
  inducted:   { label: 'Įtrauktas',   bg: '#f3e8ff', fg: '#6b21a8' },
  other:      { label: '?',           bg: '#f1f5f9', fg: '#64748b' },
}

export default function ArtistAwardsAdminPanel({ artistId, refreshKey }: { artistId: string; refreshKey?: number }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/artist-awards?artist_id=${artistId}`)
      const j = await r.json()
      setRows(j.rows || [])
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }, [artistId])

  useEffect(() => { fetchRows() }, [fetchRows, refreshKey])

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-3">
        <div className="text-xs text-[var(--text-faint)]">Kraunami apdovanojimai...</div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] p-3 text-center">
        <div className="text-xs text-[var(--text-muted)]">Apdovanojimų DB dar nėra. Spausk 🏆 mygtuką virš diskografijos panel'io, kad importuotum.</div>
      </div>
    )
  }

  // Group
  const byChannel: Record<string, Row[]> = {}
  for (const r of rows) (byChannel[r.channel_slug] ||= []).push(r)
  const channels = Object.keys(byChannel).sort((a, b) => byChannel[b].length - byChannel[a].length)

  const totalWins = rows.filter(r => r.result === 'won').length
  const totalNoms = rows.filter(r => r.result === 'nominated').length
  const partialEvents = new Set(rows.filter(r => r.participants_in_event === 1).map(r => r.event_id)).size

  const toggle = (slug: string) => {
    const s = new Set(expanded)
    if (s.has(slug)) s.delete(slug); else s.add(slug)
    setExpanded(s)
  }

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--bg-elevated)] flex items-center justify-between border-b border-[var(--border-subtle)]">
        <div className="text-xs font-bold text-[var(--text-primary)]">
          Apdovanojimai ({rows.length})
          <span className="ml-2 font-normal text-[var(--text-faint)]">
            {totalWins > 0 && <span className="text-green-700">{totalWins} W</span>}
            {totalWins > 0 && totalNoms > 0 && ' · '}
            {totalNoms > 0 && <span className="text-blue-700">{totalNoms} N</span>}
            {partialEvents > 0 && <span className="text-amber-600 ml-2">⚠ {partialEvents} pilnai neaprašytų</span>}
          </span>
        </div>
        <button onClick={fetchRows} className="text-xs text-[var(--text-faint)] hover:text-[var(--text-primary)] px-2 py-0.5 rounded hover:bg-[var(--bg-active)]">
          ↻
        </button>
      </div>
      <div className="divide-y divide-[var(--border-subtle)] max-h-[420px] overflow-y-auto">
        {channels.map(slug => {
          const items = byChannel[slug]
          const channelName = items[0].channel_name
          const wins = items.filter(r => r.result === 'won').length
          const noms = items.filter(r => r.result === 'nominated').length
          const isOpen = expanded.has(slug)
          return (
            <div key={slug}>
              <button
                onClick={() => toggle(slug)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--bg-hover)] text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs">🏆</span>
                  <span className="text-xs font-bold text-[var(--text-primary)] truncate">{channelName}</span>
                  <span className="text-[10px] text-[var(--text-faint)]">
                    {items.length}
                    {wins > 0 && <> · <span className="text-green-700">{wins}W</span></>}
                    {noms > 0 && <> · <span className="text-blue-700">{noms}N</span></>}
                  </span>
                </div>
                <svg className={`w-3 h-3 text-[var(--text-faint)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {isOpen && (
                <div className="px-3 pb-2 space-y-1">
                  {[...items].sort((a, b) => (b.edition_year || 0) - (a.edition_year || 0)).map(it => {
                    const m = RESULT_META[it.result] || RESULT_META.other
                    const partial = it.participants_in_event === 1
                    return (
                      <div key={it.id} className="flex items-center gap-2 text-[11px] py-0.5">
                        <span className="text-[var(--text-secondary)] tabular-nums w-10 shrink-0">{it.edition_year || '?'}</span>
                        <span className="flex-1 text-[var(--text-primary)] truncate">{it.event_name}</span>
                        {it.work && <span className="text-[var(--text-faint)] italic truncate max-w-[120px] hidden md:block">{it.work}</span>}
                        <span className="text-[9px] font-bold px-1.5 py-0 rounded shrink-0" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                        {partial && (
                          <span title="Tik šis atlikėjas — co-nominees vėliau" className="text-amber-600 text-[10px] shrink-0">⚠</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
