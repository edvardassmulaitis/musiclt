'use client'
// app/admin/teritorijos/TeritorijosClient.tsx
//
// Muzikos pasaulio žemėlapis: pasaulis → teritorija → atlikėjai.
// Išskleidžiamas flow, kaip prašyta: matai pasaulį, išskleidi — matai teritorijas,
// išskleidi teritoriją — matai atlikėjus, trūkstamą muziką ir kaimynes.
//
// Būsenos remiasi AI ŽINOMUMU (artist_fame 1–5), NE music.lt like'ais:
//   ✔ veikia   — ≥5 žinomų atlikėjų (fame ≥3), teritoriją galima tyrinėti
//   ⚠ plona    — 1–4 žinomi
//   ❌ tuščia  — 0 žinomų (bet teritorija lieka: tai bazės spraga, ne klaida)

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Terr = {
  id: string; name: string; era_from: number | null; era_to: number | null
  region: string | null; essence: string | null
  n_artists: number; n_known: number; n_missing: number
  status: string; priority: number; merge_into: string | null
}
type World = { id: string; name: string; color: string; terrs: Terr[]; n_terr: number; n_artists: number; n_missing: number }
type Stats = { teritorijos: number; veikia: number; plonos: number; tuscios: number; truksta: number }

type Detail = {
  terr: any
  artists: { id: number; name: string; slug: string; country: string; from: number | null; to: number | null; fame: number; source: string }[]
  missing: { id: number; artist_name: string; fame: number }[]
  neighbours: { id: string; name: string; shared: number; colike: number }[]
}

const era = (t: { era_from: number | null; era_to: number | null }) =>
  t.era_from && t.era_to ? `${t.era_from}–${t.era_to}` : t.era_from ? `${t.era_from}–` : t.era_to ? `iki ${t.era_to}` : ''

function Health({ n }: { n: number }) {
  if (n >= 5) return <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">✔ veikia</span>
  if (n > 0) return <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">⚠ plona</span>
  return <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-bold text-red-700">❌ tuščia</span>
}

const Stars = ({ f }: { f: number }) => (
  <span className="shrink-0 font-mono text-[10px] text-amber-600" title={`Žinomumas ${f}/5 (AI)`}>{'★'.repeat(f)}{'·'.repeat(5 - f)}</span>
)

export default function TeritorijosClient() {
  const [worlds, setWorlds] = useState<World[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [openWorld, setOpenWorld] = useState<string | null>(null)
  const [openTerr, setOpenTerr] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'veikia' | 'plonos' | 'tuscios' | 'truksta'>('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/teritorijos', { cache: 'no-store' })
    const d = await r.json()
    setWorlds(d.worlds || []); setStats(d.stats || null); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    if (openTerr === id) { setOpenTerr(null); setDetail(null); return }
    setOpenTerr(id); setDetail(null); setDetailLoading(true)
    const r = await fetch(`/api/admin/teritorijos?terr=${encodeURIComponent(id)}`, { cache: 'no-store' })
    setDetail(await r.json()); setDetailLoading(false)
  }

  const rejectMissing = async (id: number) => {
    await fetch('/api/admin/teritorijos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject-missing', id }),
    })
    setDetail(d => d ? { ...d, missing: d.missing.filter(m => m.id !== id) } : d)
  }

  const match = (t: Terr) => {
    if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'veikia') return t.n_known >= 5
    if (filter === 'plonos') return t.n_known > 0 && t.n_known < 5
    if (filter === 'tuscios') return t.n_known === 0
    if (filter === 'truksta') return t.n_missing > 0
    return true
  }

  if (loading) return <div className="p-8 text-sm text-[var(--text-muted)]">Kraunama…</div>

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">🗺️ Muzikos žemėlapis</h1>
        <span className="text-xs text-[var(--text-muted)]">Gilyn v3 — taksonomija iš muzikos žinojimo</span>
      </div>
      <p className="mb-5 text-[13px] text-[var(--text-muted)]">
        Teritorijos „sveikata" matuojama <strong>AI žinomumu</strong> (★1–5), ne music.lt like'ais.
        Tuščia teritorija — <em>ne klaida žemėlapyje, o spraga bazėje</em>: trūkstami atlikėjai keliauja į{' '}
        <Link href="/admin/truksta-muzikos" className="text-music-blue underline">Trūkstamą muziką</Link>.
      </p>

      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ['Teritorijų', stats.teritorijos, 'all', 'bg-[var(--bg-elevated)]'],
            ['✔ Veikia', stats.veikia, 'veikia', 'bg-emerald-50 text-emerald-800'],
            ['⚠ Plonos', stats.plonos, 'plonos', 'bg-amber-50 text-amber-800'],
            ['❌ Tuščios', stats.tuscios, 'tuscios', 'bg-red-50 text-red-800'],
            ['🧩 Trūksta', stats.truksta, 'truksta', 'bg-violet-50 text-violet-800'],
          ].map(([label, val, key, cls]) => (
            <button key={key as string} onClick={() => setFilter(key as any)}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${cls} ${filter === key ? 'border-[var(--border-strong)] ring-2 ring-[var(--border-strong)]' : 'border-[var(--input-border)]'}`}>
              <div className="text-lg font-bold">{(val as number).toLocaleString('lt-LT')}</div>
              <div className="text-[11px] opacity-80">{label as string}</div>
            </button>
          ))}
        </div>
      )}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ieškoti teritorijos…"
        className="mb-4 w-full rounded-lg border border-[var(--input-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm" />

      <div className="space-y-2">
        {worlds.map(w => {
          const shown = w.terrs.filter(match)
          if (!shown.length && (q || filter !== 'all')) return null
          const isOpen = openWorld === w.id
          return (
            <div key={w.id} className="overflow-hidden rounded-xl border border-[var(--input-border)] bg-[var(--bg-surface)]">
              <button onClick={() => setOpenWorld(isOpen ? null : w.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: w.color }} />
                <span className="flex-1 font-semibold text-[var(--text-primary)]">{w.name}</span>
                <span className="text-xs text-[var(--text-muted)]">{shown.length} terit. · {w.n_artists.toLocaleString('lt-LT')} atlik.</span>
                {w.n_missing > 0 && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10.5px] font-bold text-violet-700">🧩 {w.n_missing}</span>}
                <span className="w-4 text-[var(--text-muted)]">{isOpen ? '▾' : '▸'}</span>
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border-subtle)]">
                  {shown.map(t => (
                    <div key={t.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <button onClick={() => openDetail(t.id)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]">
                        <span className="w-4 shrink-0 text-[10px] text-[var(--text-muted)]">{openTerr === t.id ? '▾' : '▸'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                            {t.name}
                            {era(t) && <span className="ml-1.5 font-normal text-[var(--text-muted)]">{era(t)}</span>}
                            {t.region && <span className="ml-1.5 rounded bg-[var(--bg-elevated)] px-1 text-[10px] text-[var(--text-muted)]">{t.region}</span>}
                          </span>
                          {t.essence && <span className="block truncate text-[11px] text-[var(--text-muted)]">{t.essence}</span>}
                        </span>
                        {t.status === 'merge' && <span className="shrink-0 rounded bg-amber-50 px-1.5 text-[10px] text-amber-700">sulieti</span>}
                        {t.n_missing > 0 && <span className="shrink-0 text-[11px] text-violet-600" title="Trūksta žinomų atlikėjų">🧩 {t.n_missing}</span>}
                        <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{t.n_known}/{t.n_artists}</span>
                        <Health n={t.n_known} />
                      </button>

                      {openTerr === t.id && (
                        <div className="bg-[var(--bg-elevated)] px-4 py-3">
                          {detailLoading && <div className="text-xs text-[var(--text-muted)]">Kraunama…</div>}
                          {detail && (
                            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                              <div>
                                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                  Atlikėjai bazėje ({detail.artists.length})
                                </div>
                                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                                  {detail.artists.map(a => (
                                    <div key={a.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-[var(--bg-surface)]">
                                      <Stars f={a.fame} />
                                      <Link href={`/atlikejai/${a.slug}`} target="_blank"
                                        className="min-w-0 flex-1 truncate text-[var(--text-primary)] hover:text-music-blue">{a.name}</Link>
                                      <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                                        {a.from || '?'}{a.to ? `–${a.to}` : '–'}
                                      </span>
                                    </div>
                                  ))}
                                  {!detail.artists.length && <div className="text-xs text-[var(--text-muted)]">Nė vieno atlikėjo — visa teritorija yra spraga.</div>}
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div>
                                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                                    🧩 Trūksta bazėje ({detail.missing.length})
                                  </div>
                                  <div className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
                                    {detail.missing.map(m => (
                                      <div key={m.id} className="group flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12.5px] hover:bg-[var(--bg-surface)]">
                                        <Stars f={m.fame} />
                                        <span className="min-w-0 flex-1 truncate">{m.artist_name}</span>
                                        <button onClick={() => rejectMissing(m.id)} title="Nereikia"
                                          className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100">✕</button>
                                      </div>
                                    ))}
                                    {!detail.missing.length && <div className="text-xs text-[var(--text-muted)]">Kanonas padengtas.</div>}
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                    Kaimynės („kur eiti toliau")
                                  </div>
                                  <div className="space-y-0.5">
                                    {detail.neighbours.map(n => (
                                      <button key={n.id} onClick={() => openDetail(n.id)}
                                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[12.5px] hover:bg-[var(--bg-surface)]">
                                        <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{n.name}</span>
                                        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]" title={`${n.shared} bendri atlikėjai · ${n.colike} co-like`}>
                                          {n.shared}·{n.colike}
                                        </span>
                                      </button>
                                    ))}
                                    {!detail.neighbours.length && <div className="text-xs text-[var(--text-muted)]">Izoliuota teritorija.</div>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
