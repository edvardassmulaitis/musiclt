'use client'

// ── /admin/reitingai ──────────────────────────────────────────────────────
// Atlikėjų reitingų rodinys. DU režimai (toggle):
//   • Visų laikų (all-time) — kanoninis `score`: aprėptis + ilgaamžiškumas (be recency).
//   • Trending (dabar) — `score_trending`: peržiūros per dieną.
// Atskiri tab'ai LT / užsienis. Kiekviena balo dalis atskiru stulpeliu (kodėl toks
// balas) + rankinis bonus balas (±15, taikomas abiem reitingams).

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import Link from 'next/link'

type Cat = { points: number; max: number; details: string }
type ModeData = { score: number | null; base: number | null; categories: Record<string, Cat>; cat_points: Record<string, number> }
type Row = {
  id: number; name: string; slug: string | null; country: string | null; type: string | null
  score_override: number; updated_at: string | null
  alltime: ModeData; trending: ModeData
}
type Scope = 'lt' | 'world'
type Mode = 'alltime' | 'trending'

type Col = { key: string; label: string; short: string; color: string; max: number; desc: string }

const ALLTIME_COLS: Col[] = [
  { key: 'reach_total', label: 'Bendra aprėptis', short: 'Aprėptis',  color: '#a78bfa', max: 62, desc: 'Visų laikų peržiūrų suma — PAGRINDINIS matas (kiek iš viso klausyta).' },
  { key: 'legacy',      label: 'music.lt palikimas', short: 'music.lt', color: '#14b8a6', max: 20, desc: 'Senojo music.lt puslapio „patinka" — pre-YouTube populiarumas. Iškelia legendas (Mamontovas, SEL, Foje), kurių YouTube perž. mažai, bet music.lt buvo didžiulis.' },
  { key: 'heritage',    label: 'Klasika',        short: 'Klasika',   color: '#0ea5e9', max: 10, desc: 'Kaip seniai debiutavo (mažas boost\'as). Skaičiuojama tik turintiems realią auditoriją.' },
  { key: 'catalog_yt',  label: 'Katalogas',      short: 'Katalog.',  color: '#3b82f6', max: 10, desc: 'Klipų su peržiūromis skaičius.' },
]
const TRENDING_COLS: Col[] = [
  { key: 'charts',     label: 'Dabartiniai topai', short: 'Topuose',   color: '#f59e0b', max: 45, desc: 'Buvimas dabartiniuose išoriniuose topuose (Billboard, Spotify Global, Apple, Official UK; LT — M.A.M.A, AGATA, Spotify/Apple LT). Geriausia pozicija + kiek topų. Autoritetingas „trendina dabar" signalas, atnaujinamas kasdien.' },
  { key: 'pop_perday', label: 'Peržiūros / dieną', short: 'Per dieną', color: '#ec4899', max: 30, desc: 'Naujausių (2025+) dainų YouTube peržiūros per dieną — momentum.' },
  { key: 'freshness',  label: 'Šviežumas',        short: 'Šviežumas', color: '#22c55e', max: 25, desc: 'Kaip seniai išleido naujausią dainą. Ką tik išleistas albumas duoda boostą net jei peržiūrų dar mažai (pvz. naujas LT albumas).' },
]

const fmtCountry = (c: string | null) => (c && c !== 'Lietuva' ? c : '🇱🇹')

export default function ReitingaiAdmin() {
  const [scope, setScope] = useState<Scope>('world')
  const [mode, setMode] = useState<Mode>('alltime')
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState<Record<number, boolean>>({})
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [drill, setDrill] = useState<Record<number, any>>({})
  const limit = 60
  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (sc: Scope, md: Mode, search: string, off: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ scope: sc, mode: md, limit: String(limit), offset: String(off) })
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/reitingai?${params}`)
      const j = await res.json()
      setRows(j.rows || []); setTotal(j.total || 0)
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(scope, mode, q, offset) }, [scope, mode, offset, load]) // eslint-disable-line
  useEffect(() => {
    if (qDebounce.current) clearTimeout(qDebounce.current)
    qDebounce.current = setTimeout(() => { setOffset(0); load(scope, mode, q, 0) }, 350)
    return () => { if (qDebounce.current) clearTimeout(qDebounce.current) }
  }, [q]) // eslint-disable-line

  const cols = mode === 'trending' ? TRENDING_COLS : ALLTIME_COLS

  // Atnaujina abu reitingus eilutėje iš /api/artists/[id]/score atsakymo.
  const applyResp = (id: number, j: any) => setRows(rs => rs.map(r => r.id === id ? {
    ...r,
    score_override: j.score_override ?? r.score_override,
    alltime: j.breakdown ? { score: j.score, base: j.breakdown.total, categories: j.breakdown.categories, cat_points: flat(j.breakdown) } : r.alltime,
    trending: j.trending_breakdown ? { score: j.score_trending, base: j.trending_breakdown.total, categories: j.trending_breakdown.categories, cat_points: flat(j.trending_breakdown) } : r.trending,
  } : r))
  const flat = (bd: any) => { const p: Record<string, number> = {}; for (const [k, v] of Object.entries(bd.categories || {})) p[k] = (v as any)?.points ?? 0; return p }

  const changeOverride = async (row: Row, delta: number) => {
    const next = Math.max(-15, Math.min(15, (row.score_override || 0) + delta))
    if (next === row.score_override) return
    setBusy(b => ({ ...b, [row.id]: true }))
    try {
      const res = await fetch(`/api/artists/${row.id}/score`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score_override: next }),
      })
      const j = await res.json()
      if (res.ok) applyResp(row.id, j); else alert(j.error || 'Nepavyko (reikia admin rolės?)')
    } catch { alert('Tinklo klaida') }
    finally { setBusy(b => ({ ...b, [row.id]: false })) }
  }

  const recalc = async (row: Row) => {
    setBusy(b => ({ ...b, [row.id]: true }))
    try {
      const res = await fetch(`/api/artists/${row.id}/score`, { method: 'POST' })
      const j = await res.json()
      if (res.ok) applyResp(row.id, j); else alert(j.error || 'Nepavyko (reikia admin rolės?)')
    } catch { alert('Tinklo klaida') }
    finally { setBusy(b => ({ ...b, [row.id]: false })) }
  }

  const pill = (active: boolean) => `px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${active ? 'bg-orange-500 text-white' : 'bg-white border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`

  const fmtN = (n: number) => n >= 1_000_000_000 ? `${(n / 1e9).toFixed(2)} mlrd.` : n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1e3).toFixed(0)}K` : String(n)

  // Išskleidžiamas drill-down — kokios dainos subuildino balą.
  const toggleExpand = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!drill[id]) {
      try {
        const res = await fetch(`/api/admin/reitingai/tracks?artist_id=${id}`)
        const j = await res.json()
        if (res.ok) setDrill(d => ({ ...d, [id]: j }))
      } catch {}
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-[var(--text-primary)]">Atlikėjų reitingai</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Du reitingai iš YouTube peržiūrų: <b>Visų laikų</b> (aprėptis + ilgaamžiškumas, be recency) ir <b>Trending</b> (peržiūros per dieną). Rankiniai bonus balai (±15) — stulpelyje „Bonusas".
        </p>
      </div>

      {/* Režimas: Visų laikų / Trending */}
      <div className="flex items-center gap-2 mb-2">
        {([['alltime', '🏆 Visų laikų'], ['trending', '🔥 Trending (dabar)']] as [Mode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setOffset(0) }} className={pill(mode === m)}>{label}</button>
        ))}
      </div>
      {/* Scope: užsienis / LT */}
      <div className="flex items-center gap-2 mb-3">
        {([['world', '🌍 Užsienio'], ['lt', '🇱🇹 Lietuva']] as [Scope, string][]).map(([s, label]) => (
          <button key={s} onClick={() => { setScope(s); setOffset(0) }} className={pill(scope === s)}>{label}</button>
        ))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti atlikėjo…"
          className="ml-auto px-3 py-1.5 rounded-lg border border-[var(--input-border)] text-sm bg-white w-64" />
      </div>

      {/* Legenda */}
      <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-3">
        <div className="text-xs font-bold text-[var(--text-secondary)] mb-1.5">
          {mode === 'alltime' ? 'Visų laikų balas (0–100) — be recency, iškelia legendas' : 'Trending balas (0–100) — dabartinis populiarumas'}
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {cols.map(c => (
            <div key={c.key} className="flex gap-2 text-[12px] leading-snug">
              <span className="shrink-0 font-bold" style={{ color: c.color }}>{c.label} <span className="text-[var(--text-faint)]">(0–{c.max})</span></span>
              <span className="text-[var(--text-faint)]">{c.desc}</span>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-[var(--text-faint)] mt-2 pt-2 border-t border-[var(--border-subtle)]">
          <b>Bazė</b> = šių dalių suma. <b>Galutinis</b> = bazė + bonusas (±15), apkarpoma 0–100. Ta pati formulė LT ir užsienio atlikėjams.
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
                  <span className="block text-[10px] font-normal text-[var(--text-faint)]">/{c.max}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-bold w-14 border-l border-[var(--border-subtle)]">Bazė</th>
              <th className="px-2 py-2 text-center font-bold w-28">Bonusas</th>
              <th className="px-2 py-2 text-center font-black w-16">Balas</th>
              <th className="px-2 py-2 text-center font-semibold w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={cols.length + 5} className="text-center py-10 text-[var(--text-faint)]">Kraunama…</td></tr>)}
            {!loading && rows.length === 0 && (<tr><td colSpan={cols.length + 5} className="text-center py-10 text-[var(--text-faint)]">Nieko nerasta</td></tr>)}
            {!loading && rows.map((r, i) => {
              const md = r[mode]
              const isBusy = !!busy[r.id]
              const open = expandedId === r.id
              const dd = drill[r.id]
              return (
                <Fragment key={r.id}>
                <tr className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                  <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-faint)]">{offset + i + 1}</td>
                  <td className="px-2 py-1.5 sticky left-0 bg-white">
                    <button onClick={() => toggleExpand(r.id)} title="Rodyti, kokios dainos subuildino balą"
                      className="mr-1.5 text-[var(--text-faint)] hover:text-orange-600 w-4 inline-block text-center">{open ? '▾' : '▸'}</button>
                    <Link href={`/admin/artists/${r.id}`} className="font-semibold text-[var(--text-primary)] hover:text-orange-600">{r.name}</Link>
                    <span className="ml-1.5 text-[12px] text-[var(--text-faint)]">{fmtCountry(r.country)}</span>
                  </td>
                  {cols.map(c => {
                    const cat = md.categories?.[c.key]
                    const pts = md.cat_points?.[c.key] ?? 0
                    return (
                      <td key={c.key} className="px-1 py-1.5 text-center tabular-nums" title={cat?.details || ''}>
                        <span className="font-semibold" style={{ color: pts > 0 ? c.color : 'var(--text-faint)' }}>{pts}</span>
                      </td>
                    )
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-[var(--text-secondary)] border-l border-[var(--border-subtle)]">{md.base ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button disabled={isBusy} onClick={() => changeOverride(r, -1)} className="w-6 h-6 rounded bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold hover:bg-red-50 hover:text-red-600 disabled:opacity-40">−</button>
                      <span className={`w-7 text-center text-sm font-black tabular-nums ${r.score_override > 0 ? 'text-green-600' : r.score_override < 0 ? 'text-red-500' : 'text-[var(--text-faint)]'}`}>{r.score_override > 0 ? '+' : ''}{r.score_override}</span>
                      <button disabled={isBusy} onClick={() => changeOverride(r, 1)} className="w-6 h-6 rounded bg-white border border-[var(--input-border)] text-[var(--text-secondary)] font-bold hover:bg-green-50 hover:text-green-600 disabled:opacity-40">+</button>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-center"><span className="text-base font-black tabular-nums text-[var(--text-primary)]">{md.score ?? '—'}</span></td>
                  <td className="px-1 py-1.5 text-center">
                    <button disabled={isBusy} onClick={() => recalc(r)} title="Perskaičiuoti šio atlikėjo balą" className="text-[var(--text-faint)] hover:text-orange-600 disabled:opacity-40">{isBusy ? '…' : '↻'}</button>
                  </td>
                </tr>
                {open && (
                  <tr className="bg-[var(--bg-elevated)]">
                    <td colSpan={cols.length + 5} className="px-4 py-3">
                      {!dd ? (
                        <div className="text-xs text-[var(--text-faint)]">Kraunama…</div>
                      ) : (
                        <div>
                          <div className="text-[12px] text-[var(--text-secondary)] mb-2">
                            Viso peržiūrų: <b>{fmtN(dd.summary.total_views)}</b> · klipų su peržiūromis: <b>{dd.summary.n_videos}</b> · kūrybos tarpsnis: <b>{dd.summary.span_years} m.</b>{dd.summary.min_year ? ` (${dd.summary.min_year}–${dd.summary.max_year})` : ''}
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-[12px] font-bold text-[var(--text-secondary)] mb-1">🏆 Daugiausiai peržiūrų (visų laikų aprėptis)</div>
                              <ol className="space-y-0.5">
                                {dd.top_views.map((t: any, k: number) => (
                                  <li key={t.id} className="flex items-baseline gap-2 text-[13px]">
                                    <span className="text-[var(--text-faint)] w-4 text-right">{k + 1}.</span>
                                    <Link href={`/admin/tracks/${t.id}`} className="flex-1 truncate text-[var(--text-primary)] hover:text-orange-600">{t.title}</Link>
                                    {t.year && <span className="text-[var(--text-faint)] text-[11px]">{t.year}</span>}
                                    <span className="tabular-nums font-semibold text-[#a78bfa] w-16 text-right">{fmtN(t.views)}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                            <div>
                              <div className="text-[12px] font-bold text-[var(--text-secondary)] mb-1">🔥 Naujos dainos (≤2 m.) — peržiūros / dieną (trending)</div>
                              <ol className="space-y-0.5">
                                {(dd.top_recent || []).map((t: any, k: number) => (
                                  <li key={t.id} className="flex items-baseline gap-2 text-[13px]">
                                    <span className="text-[var(--text-faint)] w-4 text-right">{k + 1}.</span>
                                    <Link href={`/admin/tracks/${t.id}`} className="flex-1 truncate text-[var(--text-primary)] hover:text-orange-600">{t.title}</Link>
                                    {t.year && <span className="text-[var(--text-faint)] text-[11px]">{t.year}</span>}
                                    <span className="tabular-nums font-semibold text-[#ec4899] w-16 text-right">{fmtN(t.vpd)}/d.</span>
                                  </li>
                                ))}
                                {(!dd.top_recent || dd.top_recent.length === 0) && (
                                  <li className="text-[12px] text-[var(--text-faint)]">Nėra naujų (≤2 m.) dainų — todėl trending balas žemas.</li>
                                )}
                              </ol>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-[var(--text-muted)]">
        <span>{total.toLocaleString('lt-LT')} atlikėjų</span>
        <div className="flex items-center gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-white disabled:opacity-40">← Ankstesni</button>
          <span className="tabular-nums">{offset + 1}–{Math.min(offset + limit, total)}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-3 py-1 rounded-lg border border-[var(--border-subtle)] bg-white disabled:opacity-40">Kiti →</button>
        </div>
      </div>
    </div>
  )
}
