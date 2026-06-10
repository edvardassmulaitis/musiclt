'use client'
// app/admin/irasai/IrasaiAdminClient.tsx
// Narių įrašai — vienas plokščias „Tipas" sąrašas. Paslėpti nariai slepiami by default.
// Visi įrašai naujausi pirma (su „Rodyti daugiau"). „Sutvarkyta" pašalina iš eilės.

import { useEffect, useState, useCallback, useRef } from 'react'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'

type TopasInfo = { format: 'empty' | 'legacy' | 'new' | 'mixed'; total: number; matched: number; unmatched: number }
type Item = {
  id: string
  title: string
  blog_slug: string | null
  slug: string | null
  post_type: string
  editorial_type: string | null
  kind: string
  reviewed: boolean
  published_at: string | null
  author: string | null
  hidden: boolean
  topas: TopasInfo | null
}

// Vienas plokščias sąrašas (kaip prašė Edvardas).
const KINDS = [
  { v: 'irasas', l: 'Įrašas', hint: 'bet kas apie bet ką (numatytasis)' },
  { v: 'muzikos_apzvalga', l: 'Muzikos apžvalga', hint: 'albumai, grupės, dainos' },
  { v: 'koncertai', l: 'Koncerto įspūdžiai', hint: 'renginio apžvalga' },
  { v: 'topas', l: 'Topas', hint: '' },
  { v: 'atradimas', l: 'Atradimas', hint: 'muzikos atradimas' },
  { v: 'kuryba', l: 'Kūryba', hint: '' },
  { v: 'vertimas', l: 'Vertimas', hint: '' },
]
// Ar šis kind rodomas homepage Bendruomenės juostoje?
const SHOWN_ON_HOME = new Set(['muzikos_apzvalga', 'koncertai', 'topas', 'kuryba', 'vertimas'])

const fmtBadge: Record<string, { l: string; c: string }> = {
  empty: { l: 'tuščias', c: 'bg-gray-100 text-gray-500' },
  legacy: { l: 'legacy plain-text', c: 'bg-amber-100 text-amber-700' },
  mixed: { l: 'mišrus', c: 'bg-orange-100 text-orange-700' },
  new: { l: 'naujas formatas', c: 'bg-emerald-100 text-emerald-700' },
}

const PAGE = 100

export default function IrasaiAdminClient() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [view, setView] = useState<'todo' | 'all'>('todo')
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [enrichPanel, setEnrichPanel] = useState<string | null>(null)
  const [enrichLinks, setEnrichLinks] = useState<{ text: string; href: string; context: string }[]>([])
  const offsetRef = useRef(0)

  const fetchPage = useCallback(async (off: number) => {
    const p = new URLSearchParams({ view, include_hidden: showHidden ? '1' : '0', offset: String(off), limit: String(PAGE) })
    const r = await fetch(`/api/admin/irasai?${p}`, { cache: 'no-store' })
    const d = await r.json()
    return { items: (Array.isArray(d.items) ? d.items : []) as Item[], hasMore: !!d.hasMore }
  }, [view, showHidden])

  const load = useCallback(async () => {
    setLoading(true); offsetRef.current = 0
    try {
      const { items, hasMore } = await fetchPage(0)
      setItems(items); setHasMore(hasMore); offsetRef.current = items.length
    } catch { setItems([]) }
    setLoading(false)
  }, [fetchPage])
  useEffect(() => { load() }, [load])

  const more = async () => {
    setLoadingMore(true)
    try {
      const { items: next, hasMore } = await fetchPage(offsetRef.current)
      setItems(prev => [...prev, ...next]); setHasMore(hasMore); offsetRef.current += next.length
    } catch {}
    setLoadingMore(false)
  }

  // todo rodinyje — peržiūrėtą/priskirtą įrašą pašalinam iš sąrašo.
  const dropIfTodo = (id: string) => { if (view === 'todo') setItems(prev => prev.filter(it => it.id !== id)) }

  const setKind = async (id: string, kind: string) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, kind }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.map(it => it.id === id ? { ...it, kind, reviewed: true } : it))
      dropIfTodo(id)
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  const markReviewed = async (id: string, reviewed: boolean) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, reviewed }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.map(it => it.id === id ? { ...it, reviewed } : it))
      if (reviewed) dropIfTodo(id)
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  const enrichAct = async (id: string, action: string, extra: any = {}) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, ...extra }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      return d
    } catch (e: any) { setMsg('Klaida: ' + e.message); return null }
    finally { setBusy(null) }
  }
  const openEnrich = async (id: string) => {
    if (enrichPanel === id) { setEnrichPanel(null); return }
    setEnrichPanel(id)
    const d = await enrichAct(id, 'enrich_info'); if (d) setEnrichLinks(d.links || [])
  }
  const enrich = async (id: string) => { const d = await enrichAct(id, 'enrich_prose'); if (d) { setEnrichLinks(d.links || []); setEnrichPanel(id); setMsg(`✓ Auto-enrichinta: ${d.enriched} nuorodų`) } }
  const linkText = async (id: string, hit: any) => { const d = await enrichAct(id, 'link_text', { hit, term: hit.title || hit.artist }); if (d) { if (d.ok === false) setMsg(d.error); else setEnrichLinks(d.links || []) } }
  const unlinkText = async (id: string, text: string) => { const d = await enrichAct(id, 'unlink_text', { text }); if (d) setEnrichLinks(d.links || []) }
  const resetEnrich = async (id: string) => { const d = await enrichAct(id, 'reset_enrich'); if (d) { setEnrichLinks([]); setMsg('↺ Enrichinimas atstatytas') } }
  const normalize = async (id: string) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai/normalize-topas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      const s = d.summary
      setMsg(`✓ Normalizuota: ${s.matched} sutapo · ${s.artist_only} tik atlikėjas (trūksta dainos) · ${s.unmatched} nerasta${s.kept ? ` · ${s.kept} jau buvo` : ''}`)
      // atnaujinam topas info eilutėje
      setItems(prev => prev.map(it => it.id === id ? { ...it, reviewed: true, topas: it.topas ? { ...it.topas, format: 'new', total: s.total, matched: s.matched + s.kept, unmatched: s.artist_only + s.unmatched } : it.topas } : it))
      dropIfTodo(id)
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black text-gray-900 m-0">Narių įrašai</h1>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">↻ Atnaujinti</button>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Priskirk teisingą tipą — homepage Bendruomenės juosta rodo po 1 naujausią <b>kiekvieno tipo</b> įrašą.
        „Įrašas" (bendras, ne apie muziką) homepage nerodomas. Peržiūrėtus pažymėk „Sutvarkyta", kad dingtų iš eilės.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {([['todo', 'Reikia tvarkyti'], ['all', 'Visi']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-sm px-3 py-1.5 rounded-lg ${view === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} className="w-4 h-4" />
          Rodyti paslėptų narių įrašus
        </label>
      </div>

      {msg && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{msg}</div>}

      {loading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Kraunama…</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center">{view === 'todo' ? 'Viskas sutvarkyta 🎉' : 'Nieko nerasta.'}</div>
      ) : (
        <>
          <div className="space-y-2">
            {items.map(it => {
              const link = it.blog_slug ? `/blogas/${it.blog_slug}/${it.slug || it.id}` : null
              const onHome = SHOWN_ON_HOME.has(it.kind) && !it.hidden
              return (
                <div key={it.id} className={`bg-white border rounded-xl p-3 sm:p-4 ${it.reviewed ? 'border-gray-200 opacity-70' : 'border-gray-300'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {link
                          ? <a href={link} target="_blank" rel="noreferrer" className="font-bold text-gray-900 hover:text-orange-600 truncate">{it.title}</a>
                          : <span className="font-bold text-gray-900 truncate">{it.title}</span>}
                        {it.hidden && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">narys paslėptas</span>}
                        {it.reviewed && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">sutvarkyta</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {it.author || 'be autoriaus'} · {it.published_at ? new Date(it.published_at).toLocaleDateString('lt-LT') : 'nepublikuotas'}
                      </div>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2 py-1 rounded-lg font-semibold ${onHome ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {onHome ? '● homepage' : '○ tik /atrasti'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <label className="text-xs text-gray-500">Tipas
                      <select value={it.kind} disabled={busy === it.id}
                        onChange={e => setKind(it.id, e.target.value)}
                        className="ml-1 text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white">
                        {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}{k.hint ? ` — ${k.hint}` : ''}</option>)}
                      </select>
                    </label>

                    {it.post_type === 'topas' && it.topas && (
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-1 rounded-lg font-semibold ${fmtBadge[it.topas.format].c}`}>
                          {fmtBadge[it.topas.format].l} · {it.topas.matched}/{it.topas.total} sutapo
                        </span>
                        {it.topas.format !== 'empty' && (
                          <button onClick={() => normalize(it.id)} disabled={busy === it.id}
                            className="text-sm px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                            {busy === it.id ? '…' : it.topas.format === 'new' ? 'Pernormalizuoti' : 'Normalizuoti + automatch'}
                          </button>
                        )}
                      </div>
                    )}

                    {it.post_type !== 'topas' && (
                      <button onClick={() => openEnrich(it.id)} disabled={busy === it.id} title="Peržiūrėti / pridėti nuorodas tekste"
                        className={`text-sm px-3 py-1 rounded-lg disabled:opacity-50 ${enrichPanel === it.id ? 'bg-violet-600 text-white' : 'bg-violet-50 hover:bg-violet-100 text-violet-700'}`}>✨ Nuorodos</button>
                    )}
                    <div className="ml-auto">
                      {it.reviewed
                        ? <button onClick={() => markReviewed(it.id, false)} disabled={busy === it.id}
                            className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">↩ Atžymėti</button>
                        : <button onClick={() => markReviewed(it.id, true)} disabled={busy === it.id}
                            className="text-sm px-3 py-1 rounded-lg bg-gray-900 hover:bg-black text-white disabled:opacity-50">✓ Sutvarkyta</button>}
                    </div>
                  </div>

                  {/* Enrichinimo peržiūra / redagavimas */}
                  {enrichPanel === it.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => enrich(it.id)} disabled={busy === it.id} className="text-sm px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">✨ Auto-enrichinti</button>
                        <button onClick={() => resetEnrich(it.id)} disabled={busy === it.id} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">↺ Atstatyti</button>
                        <a href={it.blog_slug ? `/blogas/${it.blog_slug}/${it.slug || it.id}` : '#'} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">↗ Peržiūrėti įrašą</a>
                      </div>
                      <div className="text-xs text-gray-500">Pridėti nuorodą rankiniu būdu (suras pavadinimą tekste ir prikabins):</div>
                      <MusicSearchPicker compact placeholder="Ieškok atlikėjo / albumo / dainos…" onAdd={(hit: AttachmentHit) => linkText(it.id, hit)} />
                      {enrichLinks.length === 0
                        ? <div className="text-xs text-gray-400">Dar nėra nuorodų. Spausk „Auto-enrichinti" arba pridėk rankiniu būdu.</div>
                        : <div className="space-y-1">
                            {enrichLinks.map((l, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs">
                                <a href={l.href} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-orange-600 hover:underline">{l.text}</a>
                                <span className="text-gray-400 flex-1 truncate" title={l.context}>{l.context}</span>
                                <button onClick={() => unlinkText(it.id, l.text)} disabled={busy === it.id} title="atrišti" className="shrink-0 text-gray-400 hover:text-red-500">✕</button>
                              </div>
                            ))}
                          </div>}
                    </div>
                  )}

                  {it.post_type === 'topas' && it.topas && it.topas.unmatched > 0 && it.topas.format === 'new' && (
                    <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                      🚩 {it.topas.unmatched} įrašų be DB dainos — placeholder'iai. Kai scrape įkels daugiau dainų, paspausk „Pernormalizuoti".
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={more} disabled={loadingMore}
                className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">
                {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
