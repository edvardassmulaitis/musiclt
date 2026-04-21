'use client'

/**
 * /admin/tracks/merge
 *
 * Dedicated track merge flow. Two modes:
 *   1. Picker  — ?a= and/or ?b= missing. Show two search-then-select slots.
 *   2. Preview — both a & b present. Fetch /api/admin/tracks/merge/preview,
 *                render pick-field-by-field diff, confirm writes to
 *                /api/admin/tracks/merge/confirm.
 *
 * Winner selection: initially URL's `a` is winner, `b` is loser. A "Keisti
 * vietomis" button in the preview swaps them (and resets per-field choices
 * to defaults, since the pronouns flip).
 *
 * Per-field choice model:
 *   fieldChoices[field] = 'winner' | 'loser'  (default 'winner')
 * The confirm endpoint only honors fields we explicitly include; unchosen
 * fields stay as winner's value (default). We include every scalar field
 * in the UI so the admin can review each one.
 */

import { useState, useEffect, useRef, useCallback, Suspense, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type SlimTrack = {
  id: number
  title: string
  artist_name?: string
  artists?: { id: number; name: string; slug: string }
  release_year?: number | null
  type?: string
  is_single?: boolean
  featuring_count?: number
  album_count?: number
}

type DiffRow = { field: string; winner: any; loser: any; same: boolean }

type PreviewPayload = {
  winner: any
  loser: any
  diff: DiffRow[]
  unions: {
    featuring_after_merge: Array<{ artist_id: number; name: string; slug?: string; from: string }>
    albums_after_merge: Array<{ album_id: number; album_title: string; album_year: number | null; position: number; from: string }>
  }
  warnings: string[]
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Pavadinimas',
  type: 'Tipas',
  is_single: 'Singlas',
  release_date: 'Data',
  release_year: 'Metai',
  release_month: 'Mėnuo',
  release_day: 'Diena',
  video_url: 'Video URL',
  spotify_id: 'Spotify ID',
  lyrics: 'Žodžiai',
  chords: 'Akordai',
  cover_url: 'Viršelis',
  description: 'Aprašymas',
}

/** Short inline track search-then-select used for both slots. */
function TrackPicker({
  label,
  selected,
  onSelect,
  onClear,
}: {
  label: string
  selected: SlimTrack | null
  onSelect: (t: SlimTrack) => void
  onClear: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SlimTrack[]>([])
  const [loading, setLoading] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selected) { setResults([]); return }
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/tracks?search=${encodeURIComponent(q)}&limit=10`)
        const d = await r.json()
        setResults(d.tracks || [])
      } finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(t)
  }, [q, selected])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setResults([])
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{label}</div>
      {selected ? (
        <div className="border border-[var(--input-border)] bg-[var(--bg-surface)] rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold text-[var(--text-primary)] truncate">{selected.title}</div>
            <div className="text-sm text-[var(--text-secondary)] truncate">
              {selected.artists?.name || selected.artist_name || '–'}
              {selected.release_year ? ` · ${selected.release_year}` : ''}
              {selected.type && selected.type !== 'normal' ? ` · ${selected.type}` : ''}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-1">ID: {selected.id}</div>
          </div>
          <button
            onClick={onClear}
            className="text-[var(--text-muted)] hover:text-red-500 text-sm shrink-0"
            aria-label="Pašalinti"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative" ref={wrap}>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Ieškoti pagal pavadinimą arba atlikėją..."
            className="w-full px-4 py-3 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-xl text-[var(--input-text)] focus:outline-none focus:border-music-blue"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {results.length > 0 && (
            <div className="absolute z-50 w-full mt-1 overflow-hidden rounded-xl shadow-xl border border-[var(--border-default)] bg-[var(--bg-surface)] max-h-72 overflow-y-auto">
              {results.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onSelect(t); setQ(''); setResults([]) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <div className="text-sm font-medium text-[var(--text-primary)] truncate">{t.title}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {t.artists?.name || t.artist_name || '–'}
                    {t.release_year ? ` · ${t.release_year}` : ''}
                    <span className="ml-2">#{t.id}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatFieldValue(field: string, v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'lyrics' || field === 'chords' || field === 'description') {
    const s = String(v)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  }
  if (field === 'is_single') return v ? 'Taip' : 'Ne'
  return String(v)
}

function MergeContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sp = useSearchParams()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'

  const aParam = sp.get('a')
  const bParam = sp.get('b')

  const [slotA, setSlotA] = useState<SlimTrack | null>(null)
  const [slotB, setSlotB] = useState<SlimTrack | null>(null)
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'winner' | 'loser'>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmChecked, setConfirmChecked] = useState(false)

  // Load slim tracks when URL params change (used before preview expands them into full rows).
  const loadSlim = useCallback(async (id: string): Promise<SlimTrack | null> => {
    try {
      const r = await fetch(`/api/tracks/${id}`)
      if (!r.ok) return null
      const d = await r.json()
      return {
        id: d.id,
        title: d.title,
        artist_name: d.artists?.name,
        artists: d.artists,
        release_year: d.release_year,
        type: d.type,
        is_single: d.is_single,
      }
    } catch { return null }
  }, [])

  useEffect(() => {
    if (aParam) loadSlim(aParam).then(t => t && setSlotA(t))
    else setSlotA(null)
  }, [aParam, loadSlim])
  useEffect(() => {
    if (bParam) loadSlim(bParam).then(t => t && setSlotB(t))
    else setSlotB(null)
  }, [bParam, loadSlim])

  // Push slot selections back to the URL so the page is bookmarkable and reload-safe.
  const setSlot = (slot: 'a' | 'b', t: SlimTrack | null) => {
    const next = new URLSearchParams(sp.toString())
    if (t) next.set(slot, String(t.id)); else next.delete(slot)
    router.replace(`/admin/tracks/merge?${next.toString()}`)
    if (slot === 'a') setSlotA(t); else setSlotB(t)
    // Reset preview & choices whenever selection changes
    setPreview(null); setFieldChoices({}); setConfirmChecked(false); setSubmitError(null)
  }

  const swapSlots = () => {
    const next = new URLSearchParams()
    if (slotB) next.set('a', String(slotB.id))
    if (slotA) next.set('b', String(slotA.id))
    router.replace(`/admin/tracks/merge?${next.toString()}`)
    setFieldChoices({}); setConfirmChecked(false); setSubmitError(null)
  }

  const canPreview = !!(slotA && slotB && slotA.id !== slotB.id)

  // Auto-fetch preview once both slots are set.
  useEffect(() => {
    if (!canPreview) return
    const ac = new AbortController()
    setLoadingPreview(true); setPreviewError(null)
    ;(async () => {
      try {
        const r = await fetch('/api/admin/tracks/merge/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ winner_id: slotA!.id, loser_id: slotB!.id }),
          signal: ac.signal,
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setPreview(d)
        // Default per-field choice: prefer non-empty. If winner empty and loser non-empty → pick loser.
        const defaults: Record<string, 'winner' | 'loser'> = {}
        for (const row of d.diff as DiffRow[]) {
          if (!row.same) {
            const wEmpty = row.winner === null || row.winner === '' || row.winner === undefined
            const lEmpty = row.loser  === null || row.loser  === '' || row.loser  === undefined
            if (wEmpty && !lEmpty) defaults[row.field] = 'loser'
            // else keep winner default (implicit)
          }
        }
        setFieldChoices(defaults)
      } catch (e: any) {
        if (e.name !== 'AbortError') setPreviewError(e.message || 'Nepavyko įkelti preview')
      } finally {
        setLoadingPreview(false)
      }
    })()
    return () => ac.abort()
  }, [canPreview, slotA?.id, slotB?.id])

  const chooseField = (field: string, side: 'winner' | 'loser') =>
    setFieldChoices(prev => ({ ...prev, [field]: side }))

  const confirmMerge = async () => {
    if (!preview || !confirmChecked) return
    setSubmitting(true); setSubmitError(null)
    try {
      const r = await fetch('/api/admin/tracks/merge/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          winner_id: preview.winner.id,
          loser_id: preview.loser.id,
          field_choices: fieldChoices,
          confirm: true,
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      // Success → go to winner's edit page so admin can sanity-check.
      router.push(`/admin/tracks/${preview.winner.id}?merged=1`)
    } catch (e: any) {
      setSubmitError(e.message || 'Merge nepavyko')
      setSubmitting(false)
    }
  }

  const diffRows = useMemo(() => preview?.diff || [], [preview])

  useEffect(() => { if (status === 'unauthenticated') router.push('/') }, [status])
  if (status === 'loading' || !isAdmin) return null

  return (
    <div className="min-h-screen bg-[var(--bg-elevated)]">
      <div className="max-w-5xl mx-auto px-6 py-6">
        <Link href="/admin/tracks" className="text-music-blue hover:text-music-orange text-sm">← Dainos</Link>
        <h1 className="text-2xl font-black text-[var(--text-primary)] mt-1 mb-1">🔀 Sulieti dainas</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          Pasirink dvi dainas. Pirma (A) lieka — jos ID išsaugomas. Antra (B) sulieta ir ištrinama.
          Albumai ir featuring sąrašai apjungiami automatiškai; laukus renkasi rankiniu būdu žemiau.
        </p>

        {/* Slot pickers */}
        <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4 mb-4">
          <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
            <TrackPicker
              label="A — Liekanti daina (winner)"
              selected={slotA}
              onSelect={t => setSlot('a', t)}
              onClear={() => setSlot('a', null)}
            />
            <div className="shrink-0 flex items-center justify-center pt-7">
              <button
                onClick={swapSlots}
                disabled={!slotA || !slotB}
                className="px-3 py-2 text-lg text-[var(--text-muted)] hover:text-music-blue disabled:opacity-30"
                title="Sukeisti vietomis"
                aria-label="Sukeisti A ir B"
              >
                ⇄
              </button>
            </div>
            <TrackPicker
              label="B — Sulieta / trinama daina (loser)"
              selected={slotB}
              onSelect={t => setSlot('b', t)}
              onClear={() => setSlot('b', null)}
            />
          </div>
        </div>

        {/* Preview / Diff */}
        {canPreview && loadingPreview && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {previewError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-4">{previewError}</div>
        )}

        {preview && !loadingPreview && (
          <>
            {preview.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <div className="font-semibold text-amber-800 mb-2 flex items-center gap-2">⚠️ Įspėjimai</div>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-900">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Scalar field diff */}
            <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl overflow-hidden mb-4">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <div className="font-semibold text-[var(--text-primary)]">Laukų pasirinkimas</div>
                <div className="text-xs text-[var(--text-muted)]">
                  Kiekvienam laukui pasirink iš kurios dainos palikti reikšmę. Default — winner (A).
                  Sutampančius laukus galima praleisti.
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase w-36">Laukas</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">A (winner)</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-muted)] uppercase">B (loser)</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-[var(--text-muted)] uppercase w-28">Rezultatas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {diffRows.map(row => {
                    const choice = fieldChoices[row.field] || 'winner'
                    const winnerSel = choice === 'winner'
                    const loserSel = choice === 'loser'
                    return (
                      <tr key={row.field} className={row.same ? 'opacity-60' : ''}>
                        <td className="px-4 py-2 font-medium text-[var(--text-secondary)]">
                          {FIELD_LABELS[row.field] || row.field}
                        </td>
                        <td
                          className={`px-4 py-2 cursor-pointer ${winnerSel && !row.same ? 'bg-music-blue/10' : ''}`}
                          onClick={() => !row.same && chooseField(row.field, 'winner')}
                        >
                          <div className="flex items-start gap-2">
                            {!row.same && (
                              <input
                                type="radio"
                                checked={winnerSel}
                                onChange={() => chooseField(row.field, 'winner')}
                                className="mt-1 accent-music-blue"
                                aria-label={`Pasirinkti A lauką ${row.field}`}
                              />
                            )}
                            <span className="text-[var(--text-primary)] break-words">
                              {formatFieldValue(row.field, row.winner)}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`px-4 py-2 cursor-pointer ${loserSel && !row.same ? 'bg-music-blue/10' : ''}`}
                          onClick={() => !row.same && chooseField(row.field, 'loser')}
                        >
                          <div className="flex items-start gap-2">
                            {!row.same && (
                              <input
                                type="radio"
                                checked={loserSel}
                                onChange={() => chooseField(row.field, 'loser')}
                                className="mt-1 accent-music-blue"
                                aria-label={`Pasirinkti B lauką ${row.field}`}
                              />
                            )}
                            <span className="text-[var(--text-primary)] break-words">
                              {formatFieldValue(row.field, row.loser)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {row.same
                            ? <span className="text-xs text-[var(--text-muted)]">=</span>
                            : <span className="text-xs font-semibold text-music-blue">{choice === 'loser' ? 'B' : 'A'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Unions: featuring + albums */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Featuring po merge</div>
                {preview.unions.featuring_after_merge.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">Nė vieno</div>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {preview.unions.featuring_after_merge.map(f => (
                      <li key={f.artist_id} className="flex items-center justify-between gap-2">
                        <span className="text-[var(--text-primary)]">{f.name || `Artist #${f.artist_id}`}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          f.from === 'both'       ? 'bg-gray-100 text-gray-600' :
                          f.from === 'winner'     ? 'bg-blue-100 text-blue-700' :
                          f.from === 'loser_main' ? 'bg-orange-100 text-orange-700' :
                                                    'bg-green-100 text-green-700'
                        }`}>
                          {f.from === 'both' ? 'abu' : f.from === 'winner' ? 'iš A' : f.from === 'loser_main' ? 'B main → feat' : 'iš B'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--input-border)] rounded-xl p-4">
                <div className="font-semibold text-[var(--text-primary)] mb-2">Albumai po merge</div>
                {preview.unions.albums_after_merge.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">Nė vieno</div>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {preview.unions.albums_after_merge.map(a => (
                      <li key={a.album_id} className="flex items-center justify-between gap-2">
                        <span className="text-[var(--text-primary)]">
                          {a.album_title}
                          {a.album_year ? <span className="text-[var(--text-muted)]"> · {a.album_year}</span> : null}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.from === 'both'   ? 'bg-gray-100 text-gray-600' :
                          a.from === 'winner' ? 'bg-blue-100 text-blue-700' :
                                                'bg-green-100 text-green-700'
                        }`}>
                          {a.from === 'both' ? 'abu' : a.from === 'winner' ? 'iš A' : 'iš B'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Confirm bar */}
            <div className="bg-[var(--bg-surface)] border-2 border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-2xl">⚠️</div>
                <div className="text-sm text-[var(--text-primary)]">
                  <div className="font-semibold mb-1">Ši operacija negrįžtama be rankinio revert.</div>
                  <div className="text-[var(--text-secondary)]">
                    B daina (#{preview.loser.id} „{preview.loser.title}") bus ištrinta. Winner (#{preview.winner.id}) gaus
                    pasirinktas reikšmes, apjungtus albumus ir featuring. Audit log'as su snapshot'u išsaugomas
                    <code className="text-xs bg-[var(--bg-elevated)] px-1 rounded mx-1">track_merges</code>
                    lentelėje.
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none mb-3">
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={e => setConfirmChecked(e.target.checked)}
                  className="w-4 h-4 accent-music-blue"
                />
                <span>Suprantu — vykdyti merge</span>
              </label>
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-sm mb-3">{submitError}</div>
              )}
              <div className="flex items-center justify-end gap-2">
                <Link
                  href="/admin/tracks"
                  className="px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded-lg text-sm font-medium hover:bg-[var(--bg-active)]"
                >
                  Atšaukti
                </Link>
                <button
                  onClick={confirmMerge}
                  disabled={!confirmChecked || submitting}
                  className="px-5 py-2 bg-music-blue text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Vykdoma...' : 'Patvirtinti merge'}
                </button>
              </div>
            </div>
          </>
        )}

        {!canPreview && !loadingPreview && (
          <div className="bg-[var(--bg-surface)] border border-dashed border-[var(--input-border)] rounded-xl p-8 text-center text-[var(--text-muted)]">
            Pasirink abi dainas, kad pamatytum diff peržiūrą.
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminTracksMergePage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-music-blue border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <MergeContent />
    </Suspense>
  )
}
