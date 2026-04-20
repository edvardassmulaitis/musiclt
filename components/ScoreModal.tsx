'use client'

import { useState, useEffect, useCallback } from 'react'

type ScoreCategory = {
  points: number
  max: number
  details: string
}

type Breakdown = {
  type: 'lt' | 'int'
  categories: Record<string, ScoreCategory>
  total: number
  score_override: number
  final_score: number
  inputs: Record<string, number | string>
}

type ScoreData = {
  score: number | null
  score_override: number
  breakdown: Breakdown | null
  updated_at: string | null
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  catalog:    { label: 'Katalogas', color: '#3b82f6' },
  media:      { label: 'Media', color: '#8b5cf6' },
  community:  { label: 'Bendruomenė', color: '#f59e0b' },
  career:     { label: 'Karjera', color: '#10b981' },
  chart:      { label: 'Čartai', color: '#ef4444' },
  commercial: { label: 'Sertifikatai', color: '#f59e0b' },
  reach:      { label: 'Pasiekiamumas', color: '#10b981' },
}

function ScoreBar({ label, value, max, color, details }: {
  label: string; value: number; max: number; color: string; details: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-[var(--text-secondary)] w-24 text-right shrink-0">{label}</span>
        <div className="flex-1 h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="text-xs font-bold text-[var(--text-secondary)] w-12 tabular-nums text-right">{value}/{max}</span>
      </div>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="w-24 shrink-0" />
        <span className="text-[10px] text-[var(--text-faint)] leading-tight">{details}</span>
      </div>
    </div>
  )
}

export default function ScoreModal({ artistId, onClose }: { artistId: string; onClose: () => void }) {
  const [data, setData] = useState<ScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [override, setOverride] = useState(0)
  const [savingOverride, setSavingOverride] = useState(false)

  const fetchScore = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/score`)
      const json = await res.json()
      setData(json)
      setOverride(json.score_override || 0)
    } catch {}
    finally { setLoading(false) }
  }, [artistId])

  useEffect(() => { fetchScore() }, [fetchScore])

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      const res = await fetch(`/api/artists/${artistId}/score`, { method: 'POST' })
      const json = await res.json()
      setData(json)
      setOverride(json.score_override || 0)
    } catch {}
    finally { setCalculating(false) }
  }

  const handleOverrideSave = async () => {
    setSavingOverride(true)
    try {
      const res = await fetch(`/api/artists/${artistId}/score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score_override: override }),
      })
      const json = await res.json()
      setData(json)
    } catch {}
    finally { setSavingOverride(false) }
  }

  const b = data?.breakdown
  const hasScore = data?.score !== null && data?.score !== undefined

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 py-4 overflow-y-auto"
      style={{ zIndex: 9999, background: 'rgba(0,0,0,0.3)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-[var(--border-subtle)] w-full max-w-md overflow-hidden my-auto max-h-[calc(100vh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--text-secondary)]">Score</span>
            {b && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-faint)] font-medium uppercase">
                {b.type === 'lt' ? 'LT formulė' : 'INT formulė'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-lg leading-none px-1">✕</button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !hasScore ? (
            /* No score yet */
            <div className="text-center py-6">
              <div className="text-4xl mb-3 opacity-40">—</div>
              <p className="text-sm text-[var(--text-muted)] mb-4">Score dar nesuskaičiuotas</p>
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                {calculating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Skaičiuojama...
                  </span>
                ) : 'Suskaičiuoti Score'}
              </button>
            </div>
          ) : (
            /* Score display */
            <>
              {/* Big score number */}
              <div className="text-center mb-5">
                <div className="inline-flex items-baseline gap-1">
                  <span className="text-5xl font-black text-[var(--text-primary)] tabular-nums">{data.score}</span>
                  <span className="text-lg text-[var(--text-faint)]">/100</span>
                </div>
                {data.updated_at && (
                  <p className="text-[10px] text-[var(--text-faint)] mt-1">
                    Atnaujinta {new Date(data.updated_at).toLocaleDateString('lt-LT')}
                  </p>
                )}
              </div>

              {/* Breakdown bars */}
              {b && (
                <div className="mb-5">
                  {Object.entries(b.categories).map(([key, cat]) => {
                    const meta = CATEGORY_LABELS[key] || { label: key, color: '#6b7280' }
                    return (
                      <ScoreBar
                        key={key}
                        label={meta.label}
                        value={cat.points}
                        max={cat.max}
                        color={meta.color}
                        details={cat.details}
                      />
                    )
                  })}

                  <div className="flex items-center gap-3 py-1.5 mt-2 border-t border-[var(--border-subtle)]">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] w-24 text-right shrink-0">Bazė</span>
                    <div className="flex-1" />
                    <span className="text-xs font-bold text-[var(--text-primary)] w-12 tabular-nums text-right">{b.total}</span>
                  </div>
                </div>
              )}

              {/* Missing data warning for INT */}
              {b && b.type === 'int' && b.categories.chart?.points === 0 && b.categories.commercial?.points === 0 && (
                <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Nėra čartų/sertifikatų duomenų. Perbandyk importuoti diskografiją iš Wikipedia — chart positions ir certifications bus ištraukti automatiškai.
                  </p>
                </div>
              )}

              {/* Override control */}
              <div className="bg-[var(--bg-elevated)] rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[var(--text-secondary)]">Score Override</span>
                  <span className="text-xs text-[var(--text-faint)]">±15 max</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setOverride(Math.max(-15, override - 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold text-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center justify-center"
                  >−</button>

                  <div className="flex-1 text-center">
                    <span className={`text-2xl font-black tabular-nums ${
                      override > 0 ? 'text-green-600' : override < 0 ? 'text-red-500' : 'text-[var(--text-muted)]'
                    }`}>
                      {override > 0 ? '+' : ''}{override}
                    </span>
                  </div>

                  <button
                    onClick={() => setOverride(Math.min(15, override + 1))}
                    className="w-8 h-8 rounded-lg bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold text-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-colors flex items-center justify-center"
                  >+</button>
                </div>

                {override !== (data.score_override || 0) && (
                  <button
                    onClick={handleOverrideSave}
                    disabled={savingOverride}
                    className="w-full mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {savingOverride ? 'Saugoma...' : `Išsaugoti (final: ${Math.max(0, Math.min(100, (b?.total || 0) + override))})`}
                  </button>
                )}
              </div>

              {/* Recalculate button */}
              <button
                onClick={handleCalculate}
                disabled={calculating}
                className="w-full px-3 py-2 border border-[var(--input-border)] text-[var(--text-secondary)] rounded-lg text-xs font-medium hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
              >
                {calculating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Skaičiuojama...
                  </span>
                ) : 'Perskaičiuoti Score'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Small badge shown in the admin toolbar.
 * Click opens the ScoreModal.
 */
export function ScoreBadge({ artistId, score }: { artistId: string; score: number | null }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
          score !== null
            ? 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
            : 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200'
        }`}
        title={score !== null ? `Score: ${score}/100` : 'Score nesuskaičiuotas'}
      >
        {score !== null ? (
          <>
            <svg viewBox="0 0 16 16" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 1l2.1 4.3 4.7.7-3.4 3.3.8 4.7L8 11.8 3.8 14l.8-4.7L1.2 6l4.7-.7z"/>
            </svg>
            <span className="tabular-nums">{score}</span>
          </>
        ) : (
          <>Score?</>
        )}
      </button>
      {open && <ScoreModal artistId={artistId} onClose={() => setOpen(false)} />}
    </>
  )
}
