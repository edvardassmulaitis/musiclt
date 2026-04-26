'use client'

/**
 * Wikipedia Awards Import — fetch, preview, confirm.
 *
 * Workflow:
 *   1. User clicks "🏆 Importuoti apdovanojimus"
 *   2. Modal opens, calls POST /api/admin/awards/import?artist_id=X (preview mode)
 *   3. Shows checkboxed list grouped by channel
 *   4. User unchecks bad rows, clicks "Importuoti pažymėtus"
 *   5. Calls same endpoint in commit mode with selected entries
 *   6. Shows result stats
 */

import { useState } from 'react'
import FullscreenModal from '@/components/ui/FullscreenModal'

type AwardEntry = {
  channel: string
  channelSlug: string
  year: number | null
  category: string
  work: string
  workType: string
  result: 'won' | 'nominated' | 'inducted' | 'other'
  sourceLine?: string
}

type CommitStats = {
  channels_created: number; channels_existing: number
  editions_created: number; editions_existing: number
  events_created: number; events_existing: number
  participants_created: number; participants_existing: number
  tracks_created: number; albums_created: number
  skipped: number; errors: string[]
}

const RESULT_LABEL: Record<string, { label: string; color: string }> = {
  won:        { label: 'Laimėjo',     color: '#16a34a' },
  nominated:  { label: 'Nominuotas',  color: '#2563eb' },
  inducted:   { label: 'Įtrauktas',   color: '#9333ea' },
  other:      { label: '?',           color: '#94a3b8' },
}

export default function WikipediaImportAwards({
  artistId, artistName, disabled = false, onClose,
}: {
  artistId: number
  artistName: string
  disabled?: boolean
  onClose?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<'idle'|'loading'|'preview'|'committing'|'done'|'error'>('idle')
  const [entries, setEntries] = useState<AwardEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string>('')
  const [wikiTitle, setWikiTitle] = useState<string>('')
  const [stats, setStats] = useState<CommitStats | null>(null)

  const openModal = async () => {
    setOpen(true)
    setStage('loading')
    setError('')
    setEntries([])
    setStats(null)
    try {
      const r = await fetch(`/api/admin/awards/import?artist_id=${artistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error || 'fail'); setStage('error'); return }
      const list: AwardEntry[] = j.entries || []
      setEntries(list)
      setSelected(new Set(list.map((_, i) => i)))
      setWikiTitle(j.wiki_title || '')
      setStage('preview')
    } catch (e: any) {
      setError(String(e?.message || e))
      setStage('error')
    }
  }

  const toggle = (i: number) => {
    const s = new Set(selected)
    if (s.has(i)) s.delete(i); else s.add(i)
    setSelected(s)
  }

  const toggleChannel = (channel: string, selectAll: boolean) => {
    const s = new Set(selected)
    entries.forEach((e, i) => { if (e.channel === channel) { selectAll ? s.add(i) : s.delete(i) } })
    setSelected(s)
  }

  const commit = async () => {
    setStage('committing')
    const chosen = entries.filter((_, i) => selected.has(i))
    try {
      const r = await fetch(`/api/admin/awards/import?artist_id=${artistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: chosen }),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error || 'fail'); setStage('error'); return }
      setStats(j.stats)
      setStage('done')
    } catch (e: any) {
      setError(String(e?.message || e))
      setStage('error')
    }
  }

  const closeModal = () => {
    setOpen(false)
    setStage('idle')
    if (onClose) onClose()
  }

  // Group entries by channel
  const byChannel: Record<string, { idx: number; entry: AwardEntry }[]> = {}
  entries.forEach((e, i) => {
    (byChannel[e.channel] ||= []).push({ idx: i, entry: e })
  })

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          disabled
            ? 'bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
        }`}
        title={disabled ? 'Pirma importuok diskografiją' : `Importuoti apdovanojimus iš Wikipedia`}
      >
        🏆 <span className="hidden lg:inline">Apdovanojimai</span>
      </button>

      {open && (
        <FullscreenModal onClose={closeModal} title={`${artistName} — Apdovanojimai`} maxWidth="max-w-3xl">
          <div className="text-xs text-[var(--text-faint)] mb-3">
            {wikiTitle && <span>Šaltinis: <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">{wikiTitle}</code></span>}
          </div>

          {stage === 'loading' && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--text-muted)] mt-3">Ieškau apdovanojimų straipsnio Wikipedia...</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">Klaida: {error}</p>
            </div>
          )}

          {stage === 'preview' && entries.length === 0 && (
            <div className="text-center py-8">
              <div className="text-4xl mb-2 opacity-40">🏆</div>
              <p className="text-sm text-[var(--text-muted)]">
                Wikipedia neturi atskiro apdovanojimų straipsnio šiam atlikėjui.
              </p>
              <p className="text-xs text-[var(--text-faint)] mt-2">
                Tikrinta: <code>{wikiTitle}</code>
              </p>
            </div>
          )}

          {stage === 'preview' && entries.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3 sticky top-0 bg-[var(--card-bg)] py-2 z-10 border-b border-[var(--border-subtle)]">
                <div className="text-sm">
                  <strong className="text-[var(--text-primary)]">{entries.length}</strong> įrašai per{' '}
                  <strong className="text-[var(--text-primary)]">{Object.keys(byChannel).length}</strong> kanalų
                  {' • '}
                  pažymėta: <strong className="text-blue-600">{selected.size}</strong>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setSelected(new Set(entries.map((_, i) => i)))}
                    className="px-2 py-1 text-xs bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded">
                    Pažymėti viską
                  </button>
                  <button onClick={() => setSelected(new Set())}
                    className="px-2 py-1 text-xs bg-[var(--bg-elevated)] hover:bg-[var(--bg-active)] rounded">
                    Atžymėti
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {Object.entries(byChannel).sort((a, b) => b[1].length - a[1].length).map(([channel, items]) => {
                  const wonCount = items.filter(x => x.entry.result === 'won').length
                  const nomCount = items.filter(x => x.entry.result === 'nominated').length
                  const channelSelectedCount = items.filter(x => selected.has(x.idx)).length
                  return (
                    <div key={channel} className="border border-[var(--border-default)] rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-[var(--bg-elevated)] flex items-center justify-between">
                        <div className="font-bold text-sm text-[var(--text-primary)]">
                          {channel}
                          <span className="ml-2 text-xs font-normal text-[var(--text-faint)]">
                            {items.length} ({wonCount > 0 && <span className="text-green-700">{wonCount} won</span>}
                            {wonCount > 0 && nomCount > 0 && ', '}
                            {nomCount > 0 && <span className="text-blue-700">{nomCount} nom</span>})
                          </span>
                        </div>
                        <div className="flex gap-1 items-center">
                          <span className="text-xs text-[var(--text-faint)]">{channelSelectedCount}/{items.length}</span>
                          <button onClick={() => toggleChannel(channel, true)}
                            className="text-xs px-1.5 py-0.5 hover:bg-[var(--bg-active)] rounded text-[var(--text-secondary)]">✓</button>
                          <button onClick={() => toggleChannel(channel, false)}
                            className="text-xs px-1.5 py-0.5 hover:bg-[var(--bg-active)] rounded text-[var(--text-secondary)]">✗</button>
                        </div>
                      </div>
                      <div className="divide-y divide-[var(--border-subtle)]">
                        {items.map(({ idx, entry }) => {
                          const isSelected = selected.has(idx)
                          const meta = RESULT_LABEL[entry.result] || RESULT_LABEL.other
                          return (
                            <label key={idx}
                              className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-hover)] ${isSelected ? '' : 'opacity-50'}`}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggle(idx)} className="shrink-0" />
                              <span className="text-xs tabular-nums w-12 text-[var(--text-secondary)] shrink-0">{entry.year || '?'}</span>
                              <span className="text-xs flex-1 truncate">{entry.category}</span>
                              <span className="text-xs text-[var(--text-faint)] truncate max-w-[180px]">
                                {entry.workType === 'self' ? '—' : entry.work}
                              </span>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{ background: `${meta.color}15`, color: meta.color }}
                              >
                                {meta.label}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex justify-end gap-2 sticky bottom-0 bg-[var(--card-bg)] py-2 border-t border-[var(--border-subtle)]">
                <button onClick={closeModal}
                  className="px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] rounded-lg">
                  Atšaukti
                </button>
                <button onClick={commit} disabled={selected.size === 0}
                  className="px-4 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50">
                  Importuoti pažymėtus ({selected.size})
                </button>
              </div>
            </>
          )}

          {stage === 'committing' && (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[var(--text-muted)] mt-3">Saugoma į DB... (gali užtrukti minutę)</p>
            </div>
          )}

          {stage === 'done' && stats && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-bold text-green-800 mb-2">✓ Importas baigtas</p>
                <ul className="text-sm text-green-700 space-y-0.5">
                  <li>Kanalai: <strong>{stats.channels_created} naujų</strong> + {stats.channels_existing} jau buvo</li>
                  <li>Leidimai: <strong>{stats.editions_created} naujų</strong> + {stats.editions_existing} jau buvo</li>
                  <li>Kategorijos: <strong>{stats.events_created} naujų</strong> + {stats.events_existing} jau buvo</li>
                  <li>Dalyvavimai: <strong>{stats.participants_created} naujų</strong> + {stats.participants_existing} atnaujinti</li>
                  {stats.tracks_created > 0 && <li>Sukurta orphan dainų: <strong>{stats.tracks_created}</strong></li>}
                  {stats.albums_created > 0 && <li>Sukurta orphan albumų: <strong>{stats.albums_created}</strong></li>}
                  {stats.skipped > 0 && <li className="text-amber-700">Praleista: {stats.skipped}</li>}
                </ul>
              </div>
              {stats.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs font-bold text-red-700 mb-1">Klaidos ({stats.errors.length}):</p>
                  <ul className="text-[10px] text-red-600 space-y-0.5">
                    {stats.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <button onClick={closeModal} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold">
                  Uždaryti
                </button>
              </div>
            </div>
          )}
        </FullscreenModal>
      )}
    </>
  )
}
