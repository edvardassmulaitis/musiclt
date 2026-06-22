'use client'

// ── /admin/reitingai ──────────────────────────────────────────────────────
// Atlikėjų reitingų sortinimo rodinys. Aiškiai parodo KODĖL atlikėjas turi
// tokį balą — kiekviena formulės sudedamoji dalis atskiru stulpeliu — ir leidžia
// adminui priskirti rankinius papildomus balus (±15 koregavimas). Atskiri tab'ai
// LT ir užsienio atlikėjams (skirtingos formulės, atskiri reitingai).

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

type Cat = { points: number; max: number; details: string }
type Row = {
  id: number
  name: string
  slug: string | null
  country: string | null
  type: string | null
  score: number | null
  score_override: number
  base: number | null
  formula: 'lt' | 'int' | string
  categories: Record<string, Cat>
  cat_points: Record<string, number>
  updated_at: string | null
}

type Scope = 'lt' | 'world'

// Stulpeliai (atitinka lib/scoring.ts computeYTScore). Viena YouTube formulė
// LT ir užsienio atlikėjams. „desc" rodoma kaip paaiškinimas po antrašte / tooltip.
const YT_COLS: { key: string; label: string; short: string; color: string; max: number; desc: string }[] = [
  { key: 'pop_perday',  label: 'Populiarumas / dieną', short: 'Per dieną',  color: '#ec4899', max: 55, desc: 'Peržiūros per dieną = klipo peržiūros ÷ jo amžius. Esminis rodiklis — parodo realų dabartinį klausomumą ir savaime įvertina laikotarpį.' },
  { key: 'reach_total', label: 'Bendra aprėptis',      short: 'Viso perž.', color: '#a78bfa', max: 20, desc: 'Visų laikų peržiūrų suma — kiek iš viso klausyta (legendų „svoris").' },
  { key: 'freshness',   label: 'Šviežumas',            short: 'Šviežumas',  color: '#10b981', max: 15, desc: 'Peržiūros per dieną tik iš naujausių (≤3 m.) klipų — dabartinis aktyvumas.' },
  { key: 'catalog_yt',  label: 'Katalogas',            short: 'Katalogas',  color: '#3b82f6', max: 10, desc: 'Klipų su peržiūromis skaičius — ar gilus katalogas, ar vienas hitas.' },
]
const COLS: Record<'lt' | 'int', typeof YT_COLS> = { lt: YT_COLS, int: YT_COLS }

function fmtCountry(c: string | null): string {
  return c && c !== 'Lietuva' ? c : '🇱🇹'
}

export default function ReitingaiAdmin() {
  const [scope, setScope] = useState<Scope>('world')
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const limit = 60
  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (sc: Scope, search: string, off: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: sc, limit: String(limit), offset: String(off) })
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/reitingai?${params}`)
      const j = await res.json()
      setRows(j.rows || [])
      setTotal(j.total || 0)
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(scope, q, offset) }, [scope, offset, load]) // eslint-disable-line

  // Paieška su debounce → reset offset.
  useEffect(() => {
    if (qDebounce.current) clearTimeout(qDebounce.current)
    qDebounce.current = setTimeout(() => { setOffset(0); load(scope, q, 0) }, 350)
    return () => { if (qDebounce.current) clearTimeout(qDebounce.current) }
  }, [q]) // eslint-disable-line

  const cols = COLS[scope === 'lt' ? 'lt' : 'int']

  // ── Bonus (override) keitimas — optimistinis + PATCH /api/artists/[id]/score
  const changeOverride = async (row: Row, delta: number) => {
    const next = Math.max(-15, Math.min(15, (row.score_override || 0) + delta))
    if (next === row.score_override) return
    setBusy(b => ({ ...b, [row.id]: true }))
    try {
      const res = await fetch(`/api/artists/${row.id}/score`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score_override: next }),
      })
      const j = await res.json()
      if (res.ok) {
        setRows(rs => rs.map(r => r.id === row.id
          ? { ...r, score: j.score, score_override: j.score_override, base: j.breakdown?.total ?? r.base }
          : r))
      } else {
        alert(j.error || 'Nepavyko išsaugoti (reikia admin rolės?)')
      }
    } catch { alert('Tinklo klaida') }
    finally { setBusy(b => ({ ...b, [row.id]: false })) }
  }

  // ── Perskaičiuoti vieną atlikėją
  const recalc = async (row: Row) => {
    setBusy(b => ({ ...b, [row.id]: true }))
    try {
      const res = await fetch(`/api/artists/${row.id}/score`, { method: 'POST' })
      const j = await res.json()
      if (res.ok) {
        const bd = j.breakdown
        const cats = (bd && bd.categories) || {}
        const catPoints: Record<string, number> = {}
        for (const [k, v] of Object.entries(cats)) catPoints[k] = (v as any)?.points ?? 0
        setRows(rs => rs.map(r => r.id === row.id
          ? { ...r, score: j.score, score_override: j.score_override, base: bd?.total ?? r.base, formula: bd?.type || r.formula, categories: cats, cat_points: catPoints, updated_at: j.updated_at }
          : r))
      } else alert(j.error || 'Nepavyko (reikia admin rolės?)')
    } catch { alert('Tinklo klaida') }
    finally { setBusy(b => ({ ...b, [row.id]: false })) }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-[var(--text-primary)]">Atlikėjų reitingai</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Sortinimas pagal balą + pilnas skaidymas, kodėl toks balas. Rankiniai papildomi balai (±15) — stulpelyje „Bonusas".
        </p>
      </div>

      {/* Scope tabs */}
      <div className="flex items-center gap-2 mb-3">
        {([['world', '🌍 Užsienio'], ['lt', '🇱🇹 Lietuva']] as [Scope, string][]).map(([s, label]) => (
          <button
            key={s}
            onClick={() => { setScope(s); setOffset(0) }}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
              scope === s ? 'bg-orange-500 text-white' : 'bg-white border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >{label}</button>
        ))}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Ieškoti atlikėjo…"
          className="ml-auto px-3 py-1.5 rounded-lg border border-[var(--input-border)] text-sm bg-white w-64"
        />
      </div>

      {/* Formulės paaiškinimas — kiekviena dalis aiškiai */}
      <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3">
        <div className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">Kaip skaičiuojamas balas (0–100, tik iš YouTube peržiūrų)</div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {YT_COLS.map(c => (
            <div key={c.key} className="flex gap-2 text-[11px] leading-snug">
              <span className="shrink-0 font-bold tabular-nums" style={{ color: c.color }}>{c.label} <span className="text-[var(--text-faint)]">(0–{c.max})</span></span>
              <span className="text-[var(--text-faint)]">{c.desc}</span>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-[var(--text-faint)] mt-2 pt-2 border-t border-[var(--border-subtle)]">
          <b>Bazė</b> = šių keturių suma. <b>Galutinis balas</b> = bazė + rankinis bonusas (±15), apkarpoma 0–100. Ta pati formulė LT ir užsienio atlikėjams.
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
              <th className="px-2 py-2 text-right font-bold w-10">#</th>
              <th className="px-2 py-2 text-left font-bold sticky left-0 bg-[var(--bg-elevated)]">Atlikėjas</th>
              {cols.map(c => (
                <th key={c.key} className="px-2 py-2 text-center font-semibold w-16" title={`${c.label} (0–${c.max}). ${c.desc}`}>
                  <span style={{ color: c.color }}>{c.short}</span>
                  <span className="block text-[9px] font-normal text-[var(--text-faint)]">/{c.max}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-bold w-14 border-l border-[var(--border-subtle)]">Bazė</th>
              <th className="px-2 py-2 text-center font-bold w-28">Bonusas</th>
              <th className="px-2 py-2 text-center font-black w-16">Balas</th>
              <th className="px-2 py-2 text-center font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={cols.length + 5} className="text-center py-10 text-[var(--text-faint)]">Kraunama…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={cols.length + 5} className="text-center py-10 text-[var(--text-faint)]">Nieko nerasta</td></tr>
            )}
            {!loading && rows.map((r, i) => {
              const isBusy = !!busy[r.id]
              return (
                <tr key={r.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                  <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{offset + i + 1}</td>
                  <td className="px-2 py-1.5 sticky left-0 bg-white">
                    <Link href={`/admin/artists/${r.id}`} className="font-semibold text-[var(--text-primary)] hover:text-orange-600">
                      {r.name}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-[var(--text-faint)]">{fmtCountry(r.country)}</span>
                  </td>
                  {cols.map(c => {
                    const cat = r.categories?.[c.key]
                    const pts = r.cat_points?.[c.key] ?? 0
                    return (
                      <td key={c.key} className="px-1 py-1.5 text-center tabular-nums" title={cat?.details || ''}>
                        <span className="font-semibold" style={{ color: pts > 0 ? c.color : 'var(--text-faint)' }}>{pts}</span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-[var(--text-secondary)] border-l border-[var(--border-subtle)]">{r.base ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button disabled={isBusy} onClick={() => changeOverride(r, -1)}
                        className="w-6 h-6 rounded bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-40">−</button>
                      <span className={`w-7 text-center text-sm font-black tabular-nums ${r.score_override > 0 ? 'text-green-600' : r.score_override < 0 ? 'text-red-500' : 'text-[var(--text-faint)]'}`}>
                        {r.score_override > 0 ? '+' : ''}{r.score_override}
                      </span>
                      <button disabled={isBusy} onClick={() => changeOverride(r, 1)}
                        className="w-6 h-6 rounded bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold hover:bg-green-50 hover:text-green-600 disabled:opacity-40">+</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="text-base font-black tabular-nums text-[var(--text-primary)]">{r.score ?? '—'}</span>
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button disabled={isBusy} onClick={() => recalc(r)} title="Perskaičiuoti šio atlikėjo balą"
                      className="text-[var(--text-faint)] hover:text-orange-600 disabled:opacity-40">
                      {isBusy ? '…' : '↻'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-sm text-[var(--text-muted)]">
        <span>{total.toLocaleString('lt-LT')} atlikėjų</span>
        <div className="flex items-center gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-white disabled:opacity-40">← Ankstesni</button>
          <span className="tabular-nums">{offset + 1}–{Math.min(offset + limit, total)}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-white disabled:opacity-40">Kiti →</button>
        </div>
      </div>
    </div>
  )
}
