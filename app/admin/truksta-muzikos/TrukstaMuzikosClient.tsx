'use client'
// app/admin/truksta-muzikos/TrukstaMuzikosClient.tsx
// Vieninga trūkstamos muzikos eilė: parsed requestas + automatch + pridėti
// atlikėją / albumą / dainą / susieti / atmesti. Šaltiniai: topai, radaras, top40, atradimai.

import { useEffect, useState, useCallback } from 'react'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'

type EvCtx = { title: string; slug: string | null; is_festival: boolean; is_headliner: boolean; upcoming: boolean }
type Item = {
  id: string; source: string; raw_artist: string | null; raw_title: string | null
  kind_hint: string | null; status: string; context: string | null
  artist_ok: boolean; artist_name: string | null; artist_web: string | null; artist_admin: string | null
  matched_type: string | null; matched_id: number | null; matched_cover: string | null; web: string | null; admin: string | null
  events?: EvCtx[]; priority?: number; priorityLabel?: string; followers?: number
}

const SRC_LABEL: Record<string, string> = { topas: 'Topai', radaras: 'Radaras', top40: 'Top 40/30', discovery: 'Atradimai', post: 'Įrašai', empty: 'Tušti atlikėjai', import: 'Importas' }

function Ext({ href, kind }: { href: string; kind: 'admin' | 'web' }) {
  return <a href={href} target="_blank" rel="noreferrer" className={`shrink-0 text-xs px-1 ${kind === 'admin' ? 'text-gray-400 hover:text-violet-700' : 'text-gray-400 hover:text-orange-600'}`} title={kind === 'admin' ? 'Admin' : 'Vieša'}>{kind === 'admin' ? '✎' : '↗'}</a>
}

export default function TrukstaMuzikosClient() {
  const [items, setItems] = useState<Item[]>([])
  const [bySource, setBySource] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ status }); if (source) p.set('source', source)
      const r = await fetch(`/api/admin/music-requests?${p}`, { cache: 'no-store' })
      const d = await r.json()
      setItems(Array.isArray(d.items) ? d.items : []); setBySource(d.bySource || {})
    } catch { setItems([]) }
    setLoading(false)
  }, [status, source])
  useEffect(() => { load() }, [load])

  const act = async (action: string, extra: any = {}) => {
    setBusy(extra.id || action); setMsg(null)
    try {
      const r = await fetch('/api/admin/music-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      return d
    } catch (e: any) { setMsg('Klaida: ' + e.message); return null }
    finally { setBusy(null) }
  }
  const collect = async () => { const d = await act('collect_topas'); if (d) { setMsg(`✓ Surinkta iš topų: +${d.inserted} naujų (skenuota ${d.scanned})`); load() } }
  const collectEmpty = async () => { const d = await act('collect_empty_artists'); if (d) { setMsg(`✓ Tušti atlikėjai: +${d.inserted} naujų (rasta ${d.scanned} be muzikos/nuotraukos)`); load() } }
  const automatchAll = async () => { const d = await act('automatch_all'); if (d) { setMsg(`✓ Automatch: ${d.matched} sutvarkyta`); load() } }
  const rowAct = async (id: string, action: string, extra: any = {}) => {
    const d = await act(action, { id, ...extra }); if (d) { if (status === 'pending') setItems(prev => prev.filter(i => i.id !== id)); else load(); setLinkOpen(null) }
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black text-gray-900 m-0">Trūkstama muzika</h1>
        <div className="flex gap-2">
          <button onClick={collect} disabled={!!busy} className="text-sm px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-black text-white disabled:opacity-50">↺ Surinkti iš topų</button>
          <button onClick={collectEmpty} disabled={!!busy} className="text-sm px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50" title="Atlikėjai, kurie DB jau yra, bet be muzikos ir nuotraukos (pvz. festivalių line-up'ai)">⚠ Surinkti tuščius atlikėjus</button>
          <button onClick={automatchAll} disabled={!!busy} className="text-sm px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">Automatch visus</button>
          <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">↻</button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Bendruomenės minimi atlikėjai / albumai / dainos, kurių dar nėra DB. Surink iš šaltinių, automatch, tada pridėk kaip
        <b> atlikėją</b>, <b>albumą</b> ar <b>dainą</b> — kad viskas, apie ką kalbama, būtų prieinama.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {([['pending', 'Laukia'], ['resolved', 'Sutvarkyti'], ['all', 'Visi']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={`text-sm px-3 py-1.5 rounded-lg ${status === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setSource('')} className={`text-sm px-2.5 py-1.5 rounded-lg ${!source ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Visi šaltiniai</button>
          {Object.entries(bySource).map(([s, n]) => (
            <button key={s} onClick={() => setSource(s)} className={`text-sm px-2.5 py-1.5 rounded-lg ${source === s ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{SRC_LABEL[s] || s} ({n})</button>
          ))}
        </div>
      </div>

      {msg && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{msg}</div>}

      {loading ? <div className="text-gray-400 text-sm py-10 text-center">Kraunama…</div>
        : items.length === 0 ? <div className="text-gray-400 text-sm py-10 text-center">{status === 'pending' ? 'Nieko nelaukia 🎉 (spausk „Surinkti iš topų")' : 'Nieko nerasta.'}</div>
        : (
        <div className="space-y-1.5">
          {items.map(it => {
            const resolved = it.status !== 'pending'
            const empty = it.source === 'empty'
            // ── Tuščio atlikėjo eilutė: raudona, kol nepažymėta „Sutvarkyta" ──
            if (empty) {
              const evs = it.events || []
              const pl = it.priorityLabel
              const plCls = pl === 'Aukštas' ? 'bg-red-600 text-white' : pl === 'Vidutinis' ? 'bg-amber-500 text-white' : 'bg-gray-300 text-gray-700'
              // Kraštinė pagal prioritetą (svarbumą)
              const border = resolved ? 'bg-gray-50 border-gray-200'
                : pl === 'Aukštas' ? 'bg-red-50 border-red-400 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]'
                : pl === 'Vidutinis' ? 'bg-amber-50 border-amber-300'
                : 'bg-white border-gray-200'
              return (
                <div key={it.id} className={`rounded-xl p-3 border ${border}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-base ${resolved ? 'bg-gray-200 text-gray-400' : pl === 'Aukštas' ? 'bg-red-100 text-red-500' : pl === 'Vidutinis' ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>{resolved ? '✓' : '♪'}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{it.raw_artist}</span>
                        {!resolved && pl && <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${plCls}`}>{pl} prioritetas</span>}
                        {resolved && <span className="text-[13px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ Sutvarkyta</span>}
                        {it.admin && <Ext href={it.admin} kind="admin" />}
                        {it.artist_web && <Ext href={it.artist_web} kind="web" />}
                      </div>
                      {/* Kodėl trūksta — kuriuose renginiuose/festivaliuose dalyvauja */}
                      {evs.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {evs.slice(0, 4).map((ev, i) => (
                            <span key={i} className={`inline-flex items-center gap-1 text-[13px] px-1.5 py-0.5 rounded border ${ev.upcoming ? 'bg-cyan-50 border-cyan-200 text-cyan-800' : 'bg-gray-50 border-gray-200 text-gray-500'}`} title={ev.upcoming ? 'Būsimas' : 'Praėjęs'}>
                              {ev.is_festival ? '🎪' : '🎫'}
                              {ev.is_headliner && <span className="text-orange-500" title="Headlineris">★</span>}
                              <span className="font-medium">{ev.title}</span>
                              {ev.upcoming && <span className="text-cyan-600 font-bold">· būsimas</span>}
                            </span>
                          ))}
                          {evs.length > 4 && <span className="text-[13px] text-gray-400">+{evs.length - 4}</span>}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1">Be muzikos ir nuotraukos · nesusietas su renginiais</div>
                      )}
                    </div>
                    {!resolved && (
                      <div className="shrink-0 flex items-center gap-1">
                        <button onClick={() => rowAct(it.id, 'mark_fixed')} disabled={busy === it.id} className="text-xs font-semibold px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">✓ Sutvarkyta</button>
                        <button onClick={() => rowAct(it.id, 'reject')} disabled={busy === it.id} title="atmesti" className="text-xs px-1.5 py-1 rounded bg-white border border-gray-200 text-gray-400 hover:text-red-500">✕</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            }
            return (
              <div key={it.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  {it.matched_cover
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.matched_cover} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                    : <div className="w-9 h-9 rounded bg-gray-100 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{it.raw_title || it.raw_artist}</span>
                      <span className="text-[13px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{SRC_LABEL[it.source] || it.source}</span>
                      {it.kind_hint && <span className="text-[13px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-400">{it.kind_hint}</span>}
                      {it.source === 'import' && !!it.followers && it.followers > 0 && (
                        <span className="text-[13px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700" title="Tiek narių laukia šios muzikos — sutvarkius automatiškai atsiras jų profilyje">👤 {it.followers} laukia</span>
                      )}
                      {resolved && it.matched_type && (
                        <span className="text-[13px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ {it.matched_type}</span>
                      )}
                      {resolved && it.web && <Ext href={it.web} kind="web" />}
                      {resolved && it.admin && <Ext href={it.admin} kind="admin" />}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{it.raw_title ? (it.raw_artist || '') : 'atlikėjas'}</span>
                      {it.artist_ok
                        ? <><span className="text-emerald-600">✓ atl.</span>{it.artist_web && <Ext href={it.artist_web} kind="web" />}{it.artist_admin && <Ext href={it.artist_admin} kind="admin" />}</>
                        : <span className="text-red-500">✗ atl.</span>}
                      {it.context && <span className="text-gray-400">· {it.context}</span>}
                    </div>
                  </div>
                  {!resolved && (
                    <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end max-w-[340px]">
                      <button onClick={() => rowAct(it.id, 'automatch')} disabled={busy === it.id} className="text-xs px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 disabled:opacity-50">Automatch</button>
                      <button onClick={() => rowAct(it.id, 'create_artist')} disabled={busy === it.id} className="text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50">+ Atlikėjas</button>
                      <button onClick={() => rowAct(it.id, 'create_album')} disabled={busy === it.id} className="text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50">+ Albumas</button>
                      <button onClick={() => rowAct(it.id, 'create_track')} disabled={busy === it.id} className="text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50">+ Daina</button>
                      <button onClick={() => setLinkOpen(linkOpen === it.id ? null : it.id)} className="text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700">Susieti</button>
                      <button onClick={() => rowAct(it.id, 'reject')} disabled={busy === it.id} title="atmesti" className="text-xs px-1.5 py-1 rounded bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500">✕</button>
                    </div>
                  )}
                </div>
                {linkOpen === it.id && (
                  <div className="mt-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <MusicSearchPicker compact placeholder="Ieškok esamo atlikėjo / albumo / dainos…" onAdd={(hit: AttachmentHit) => rowAct(it.id, 'link', { hit })} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
