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
  featured: boolean
  featured_until: string | null
  home_hero: boolean
  published_at: string | null
  author: string | null
  hidden: boolean
  view_count: number
  is_deleted: boolean
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
  const [showDeleted, setShowDeleted] = useState(false)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [enrichPanel, setEnrichPanel] = useState<string | null>(null)
  const [enrichLinks, setEnrichLinks] = useState<{ text: string; href: string; context: string }[]>([])
  const offsetRef = useRef(0)

  const fetchPage = useCallback(async (off: number) => {
    const p = new URLSearchParams({ view, include_hidden: showHidden ? '1' : '0', offset: String(off), limit: String(PAGE) })
    if (showDeleted) p.set('deleted', '1')
    if (username.trim()) p.set('username', username.trim())
    const r = await fetch(`/api/admin/irasai?${p}`, { cache: 'no-store' })
    const d = await r.json()
    return { items: (Array.isArray(d.items) ? d.items : []) as Item[], hasMore: !!d.hasMore }
  }, [view, showHidden, showDeleted, username])

  const load = useCallback(async () => {
    setLoading(true); offsetRef.current = 0
    try {
      const { items, hasMore } = await fetchPage(0)
      setItems(items); setHasMore(hasMore); offsetRef.current = items.length
    } catch { setItems([]) }
    setLoading(false)
  }, [fetchPage])
  // Debounce — kad rašant username nešaudytume užklausų kiekvienam simboliui.
  useEffect(() => { const t = setTimeout(() => { load() }, 250); return () => clearTimeout(t) }, [load])

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

  // „Homepage hero" — įrašas rodomas pradžios hero feede tarp naujienų.
  const setHomeHero = async (id: string, home_hero: boolean) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, home_hero }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.map(it => it.id === id ? { ...it, home_hero } : it))
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  // „Dėmesio centre" — featured su pasirenkama trukme.
  const setFeatured = async (id: string, featured: boolean, hours = 48) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, featured, featured_hours: hours }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.map(it => it.id === id ? { ...it, featured, featured_until: d.featured_until || null } : it))
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  // Vizualas featured įrašui (kai cover neišsisprendžia automatiškai).
  const setFeaturedCover = async (id: string) => {
    const url = window.prompt('Vizualo URL (nuotraukos adresas):')
    if (!url) return
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, featured_cover: url }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setMsg('Vizualas išsaugotas ✓')
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

  // Soft-delete: atgaivinti (is_deleted=false) arba paslėpti (true). Po veiksmo
  // įrašas pakeičia rodinį (atgaivintas dingsta iš „Paslėpti", paslėptas iš įprasto).
  const setDeleted = async (id: string, isDeleted: boolean) => {
    if (isDeleted && !confirm('Paslėpti šį įrašą iš visų puslapių?')) return
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_deleted: isDeleted }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.filter(it => it.id !== id))
      setMsg(isDeleted ? 'Įrašas paslėptas ✓' : 'Įrašas atgaivintas ✓')
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
        <button onClick={() => setShowDeleted(v => !v)}
          className={`text-sm px-3 py-1.5 rounded-lg ${showDeleted ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          🗑 Ištrinti įrašai
        </button>
        <div className="relative ml-auto">
          <input
            type="text" value={username} onChange={e => setUsername(e.target.value)}
            placeholder="Filtruoti pagal narį (username)…"
            className="text-sm border border-gray-200 rounded-lg pl-8 pr-7 py-1.5 w-64 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
          {username && (
            <button onClick={() => setUsername('')} title="Išvalyti"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">✕</button>
          )}
        </div>
      </div>
      {username.trim() && (
        <p className="-mt-2 mb-3 text-xs text-gray-500">
          Rodomi nario <b>@{username.trim()}</b> įrašai{view === 'todo' ? ' (rodinys „Reikia tvarkyti" — perjunk į „Visi", kad matytum ir sutvarkytus)' : ''}.
        </p>
      )}

      {msg && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{msg}</div>}

      {loading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Kraunama…</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center">{showDeleted ? 'Ištrintų įrašų nėra.' : view === 'todo' ? 'Viskas sutvarkyta 🎉' : 'Nieko nerasta.'}</div>
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
                        {it.hidden && <span className="text-[14px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">narys paslėptas</span>}
                        {it.is_deleted && <span className="text-[14px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">🗑 ištrintas</span>}
                        {it.reviewed && <span className="text-[14px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">sutvarkyta</span>}
                        {it.featured && <span className="text-[14px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold" title={it.featured_until ? `iki ${new Date(it.featured_until).toLocaleString('lt-LT')}` : ''}>★ verta dėmesio</span>}
                        {it.home_hero && <span className="text-[14px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">🏠 hero</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {it.author || 'be autoriaus'} · {it.published_at ? new Date(it.published_at).toLocaleDateString('lt-LT') : 'nepublikuotas'} · 👁 {it.view_count.toLocaleString('lt-LT')} perž.
                      </div>
                    </div>
                    <span className={`shrink-0 text-[14px] px-2 py-1 rounded-lg font-semibold ${onHome ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
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
                        <span className={`text-[14px] px-2 py-1 rounded-lg font-semibold ${fmtBadge[it.topas.format].c}`}>
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

                    {it.featured ? (
                      <span className="flex items-center gap-1.5">
                        <button onClick={() => setFeatured(it.id, false)} disabled={busy === it.id}
                          className="text-sm px-3 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">★ Featured (išjungti)</button>
                        <button onClick={() => setFeaturedCover(it.id)} disabled={busy === it.id}
                          title="Priskirti vizualą (jei automatiškai neišsisprendžia)"
                          className="text-sm px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 disabled:opacity-50">🖼</button>
                      </span>
                    ) : (
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <span className="text-amber-600 font-semibold">☆ Featured</span>
                        <select defaultValue="" disabled={busy === it.id}
                          onChange={e => { const h = parseInt(e.target.value); if (h) setFeatured(it.id, true, h); e.target.value = '' }}
                          className="text-sm border border-amber-200 rounded-lg px-1.5 py-1 bg-amber-50 text-amber-700">
                          <option value="" disabled>trukmė…</option>
                          <option value="24">24 val.</option>
                          <option value="48">48 val.</option>
                          <option value="168">7 d.</option>
                          <option value="336">14 d.</option>
                        </select>
                      </label>
                    )}

                    {it.post_type !== 'topas' && (
                      <button onClick={() => openEnrich(it.id)} disabled={busy === it.id} title="Peržiūrėti / pridėti nuorodas tekste"
                        className={`text-sm px-3 py-1 rounded-lg disabled:opacity-50 ${enrichPanel === it.id ? 'bg-violet-600 text-white' : 'bg-violet-50 hover:bg-violet-100 text-violet-700'}`}>✨ Nuorodos</button>
                    )}
                    <button onClick={() => setHomeHero(it.id, !it.home_hero)} disabled={busy === it.id}
                      title="Rodyti pradžios hero feede tarp naujienų"
                      className={`text-sm px-3 py-1 rounded-lg disabled:opacity-50 ${it.home_hero ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-orange-50 hover:bg-orange-100 text-orange-700'}`}>
                      {it.home_hero ? '🏠 Hero (išjungti)' : '🏠 Į hero'}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {it.is_deleted
                        ? <button onClick={() => setDeleted(it.id, false)} disabled={busy === it.id}
                            className="text-sm px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">↩ Atgaivinti</button>
                        : <>
                            <button onClick={() => setDeleted(it.id, true)} disabled={busy === it.id} title="Paslėpti įrašą iš visų puslapių"
                              className="text-sm px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50">🗑 Paslėpti</button>
                            {it.reviewed
                              ? <button onClick={() => markReviewed(it.id, false)} disabled={busy === it.id}
                                  className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">↩ Atžymėti</button>
                              : <button onClick={() => markReviewed(it.id, true)} disabled={busy === it.id}
                                  className="text-sm px-3 py-1 rounded-lg bg-gray-900 hover:bg-black text-white disabled:opacity-50">✓ Sutvarkyta</button>}
                          </>}
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
                    <div className="mt-2 text-[14px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
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
