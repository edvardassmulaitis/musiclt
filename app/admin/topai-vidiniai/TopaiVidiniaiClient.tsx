'use client'
// app/admin/topai-vidiniai/TopaiVidiniaiClient.tsx
// Vidinių topų susiejimo eilė: auto-match → per-įrašo link/create → patvirtinti.

import { useEffect, useState, useCallback, useRef } from 'react'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

type Entry = {
  rank: number; title: string; artist: string | null; type: string
  entity_id: number | null; entity_slug: string | null; image_url: string | null
  state: 'matched' | 'artist_only' | 'unmatched' | 'legacy'
}
type Topas = {
  id: string; title: string; blog_slug: string | null; slug: string | null
  author: string | null; hidden: boolean; approved: boolean; published_at: string | null
  entries: Entry[]; total: number; connected: number; unconnected: number; legacy: number
}

const STATE_BADGE: Record<Entry['state'], { l: string; c: string }> = {
  matched: { l: '✓ sujungta', c: 'bg-emerald-100 text-emerald-700' },
  artist_only: { l: '⚠ tik atlikėjas', c: 'bg-amber-100 text-amber-700' },
  unmatched: { l: '✗ nerasta', c: 'bg-red-100 text-red-600' },
  legacy: { l: 'neapdorota', c: 'bg-gray-100 text-gray-500' },
}
const PAGE = 40

export default function TopaiVidiniaiClient() {
  const [items, setItems] = useState<Topas[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [view, setView] = useState<'todo' | 'approved' | 'all'>('todo')
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [linkOpen, setLinkOpen] = useState<string | null>(null) // `${id}:${rank}`
  const [msg, setMsg] = useState<string | null>(null)
  const offsetRef = useRef(0)

  const fetchPage = useCallback(async (off: number) => {
    const p = new URLSearchParams({ view, include_hidden: showHidden ? '1' : '0', offset: String(off), limit: String(PAGE) })
    const r = await fetch(`/api/admin/topai-vidiniai?${p}`, { cache: 'no-store' })
    const d = await r.json()
    return { items: (Array.isArray(d.items) ? d.items : []) as Topas[], hasMore: !!d.hasMore }
  }, [view, showHidden])

  const load = useCallback(async () => {
    setLoading(true); offsetRef.current = 0
    try { const { items, hasMore } = await fetchPage(0); setItems(items); setHasMore(hasMore); offsetRef.current = items.length }
    catch { setItems([]) }
    setLoading(false)
  }, [fetchPage])
  useEffect(() => { load() }, [load])

  const more = async () => {
    setLoadingMore(true)
    try { const { items: n, hasMore } = await fetchPage(offsetRef.current); setItems(p => [...p, ...n]); setHasMore(hasMore); offsetRef.current += n.length } catch {}
    setLoadingMore(false)
  }

  const patchTopas = (id: string, patch: Partial<Topas>) => setItems(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))

  const act = async (id: string, action: string, extra: any = {}) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/topai-vidiniai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      return d
    } catch (e: any) { setMsg('Klaida: ' + e.message); return null }
    finally { setBusy(null) }
  }

  const automatch = async (id: string) => {
    const d = await act(id, 'automatch')
    if (d) { patchTopas(id, { entries: d.entries, total: d.total, connected: d.connected, unconnected: d.unconnected, legacy: d.legacy }); setMsg(`✓ Auto-match: ${d.connected}/${d.total} sujungta`) }
  }
  const createMissing = async (id: string) => {
    const d = await act(id, 'create_missing')
    if (d) { patchTopas(id, { entries: d.entries, total: d.total, connected: d.connected, unconnected: d.unconnected, legacy: d.legacy }); setMsg(`✓ Sukurta trūkstamų · dabar ${d.connected}/${d.total} sujungta`) }
  }
  const approve = async (id: string, approved: boolean) => {
    const d = await act(id, approved ? 'approve' : 'unapprove')
    if (d) { patchTopas(id, { approved }); if (approved && view === 'todo') setItems(p => p.filter(t => t.id !== id)) }
  }
  const linkEntry = async (id: string, rank: number, hit: AttachmentHit) => {
    const d = await act(id, 'link_entry', { rank, hit })
    if (d) { patchTopas(id, { entries: d.entries, total: d.total, connected: d.connected, unconnected: d.unconnected, legacy: d.legacy }); setLinkOpen(null) }
  }

  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black text-gray-900 m-0">Vidiniai topai</h1>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">↻ Atnaujinti</button>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Narių topai susiejami su DB katalogu (kaip išoriniai topai). <b>Auto-match</b> → trūkstamus
        <b> sukurti</b> arba susieti rankiniu būdu → <b>Patvirtinti</b>. Tik patvirtinti topai rodomi homepage.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {([['todo', 'Laukia'], ['approved', 'Patvirtinti'], ['all', 'Visi']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-sm px-3 py-1.5 rounded-lg ${view === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} className="w-4 h-4" />
          Rodyti paslėptų narių topus
        </label>
      </div>

      {msg && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{msg}</div>}

      {loading ? <div className="text-gray-400 text-sm py-10 text-center">Kraunama…</div>
        : items.length === 0 ? <div className="text-gray-400 text-sm py-10 text-center">{view === 'todo' ? 'Nieko nelaukia 🎉' : 'Nieko nerasta.'}</div>
        : (
        <>
          <div className="space-y-2">
            {items.map(t => {
              const link = t.blog_slug ? `/blogas/${t.blog_slug}/${t.slug || t.id}` : null
              const allConnected = t.connected === t.total && t.total > 0
              const isOpen = expanded.has(t.id)
              return (
                <div key={t.id} className={`bg-white border rounded-xl p-3 sm:p-4 ${t.approved ? 'border-emerald-200' : 'border-gray-300'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {link ? <a href={link} target="_blank" rel="noreferrer" className="font-bold text-gray-900 hover:text-orange-600 truncate">{t.title}</a>
                          : <span className="font-bold text-gray-900 truncate">{t.title}</span>}
                        {t.hidden && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">narys paslėptas</span>}
                        {t.approved && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">patvirtinta</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.author || 'be autoriaus'} · {t.published_at ? new Date(t.published_at).toLocaleDateString('lt-LT') : '—'}</div>
                    </div>
                    <span className={`shrink-0 text-[11px] px-2 py-1 rounded-lg font-semibold ${allConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {t.connected}/{t.total} sujungta
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button onClick={() => automatch(t.id)} disabled={busy === t.id}
                      className="text-sm px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                      {busy === t.id ? '…' : 'Auto-match'}
                    </button>
                    {t.unconnected > 0 && (
                      <button onClick={() => createMissing(t.id)} disabled={busy === t.id}
                        className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">
                        Sukurti trūkstamus ({t.unconnected})
                      </button>
                    )}
                    <button onClick={() => toggleExpand(t.id)}
                      className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                      {isOpen ? 'Slėpti įrašus' : `Įrašai (${t.total})`}
                    </button>
                    <div className="ml-auto">
                      {t.approved
                        ? <button onClick={() => approve(t.id, false)} disabled={busy === t.id} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">↩ Atšaukti</button>
                        : <button onClick={() => approve(t.id, true)} disabled={busy === t.id}
                            className={`text-sm px-3 py-1 rounded-lg text-white disabled:opacity-50 ${allConnected ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-900 hover:bg-black'}`}>
                            ✓ Patvirtinti{!allConnected ? ' (nepilnas)' : ''}
                          </button>}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-3 border-t border-gray-100 pt-2 space-y-1">
                      {t.entries.map(e => {
                        const key = `${t.id}:${e.rank}`
                        const sb = STATE_BADGE[e.state]
                        return (
                          <div key={e.rank} className="flex items-center gap-2 py-1">
                            <span className="shrink-0 w-5 text-center text-xs font-bold text-gray-400">{e.rank}</span>
                            {e.image_url
                              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(e.image_url)} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                              : <div className="w-7 h-7 rounded bg-gray-100 shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-gray-800 truncate">{e.title}</div>
                              {e.artist && <div className="text-xs text-gray-500 truncate">{e.artist}</div>}
                            </div>
                            <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded font-semibold ${sb.c}`}>{sb.l}</span>
                            <button onClick={() => setLinkOpen(linkOpen === key ? null : key)}
                              className="shrink-0 text-xs px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700">
                              {e.entity_id == null ? 'Susieti' : 'Keisti'}
                            </button>
                          </div>
                        )
                      })}
                      {linkOpen?.startsWith(`${t.id}:`) && (
                        <div className="mt-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                          <div className="text-xs text-gray-500 mb-1">Susieti #{linkOpen.split(':')[1]} su daina / atlikėju:</div>
                          <MusicSearchPicker compact placeholder="Ieškok dainos ar atlikėjo…"
                            onAdd={(hit) => linkEntry(t.id, parseInt(linkOpen.split(':')[1], 10), hit)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={more} disabled={loadingMore} className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">
                {loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
