'use client'
// app/admin/topai-vidiniai/TopaiVidiniaiClient.tsx
// Vidinių topų susiejimo eilė. Įrašai matomi inline; per-įrašo susieti / sukurti /
// pašalinti; pridėti įrašą; importuoti įrašus iš teksto; auto-match; patvirtinti.

import { useEffect, useState, useCallback, useRef } from 'react'
import MusicSearchPicker, { type AttachmentHit } from '@/components/MusicSearchPicker'
import { proxyImg } from '@/lib/img-proxy'

type Entry = {
  rank: number; title: string; artist: string | null; type: string
  entity_id: number | null; entity_slug: string | null; image_url: string | null
  artist_id: number | null; artist_slug: string | null; artist_ok: boolean; entity_ok: boolean
  web_href: string | null; admin_href: string | null; artist_web: string | null; artist_admin: string | null
  state: 'matched' | 'artist_only' | 'unmatched' | 'legacy'
}
type Topas = {
  id: string; title: string; blog_slug: string | null; slug: string | null
  author: string | null; hidden: boolean; approved: boolean; published_at: string | null
  entries: Entry[]; total: number; connected: number; unconnected: number; legacy: number
  content_entries: number
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
  const [linkOpen, setLinkOpen] = useState<string | null>(null) // `${id}:${rank}`
  const [addOpen, setAddOpen] = useState<string | null>(null)    // id
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

  const patchTopas = (id: string, d: any) => setItems(prev => prev.map(t => t.id === id
    ? { ...t, entries: d.entries ?? t.entries, total: d.total ?? t.total, connected: d.connected ?? t.connected, unconnected: d.unconnected ?? t.unconnected, legacy: d.legacy ?? t.legacy }
    : t))

  const act = async (id: string, action: string, extra: any = {}) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/topai-vidiniai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) })
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'klaida')
      return d
    } catch (e: any) { setMsg('Klaida: ' + e.message); return null }
    finally { setBusy(null) }
  }

  const automatch = async (id: string) => { const d = await act(id, 'automatch'); if (d) { patchTopas(id, d); setMsg(`✓ Auto-match: ${d.connected}/${d.total} sujungta`) } }
  const createMissing = async (id: string) => { const d = await act(id, 'create_missing'); if (d) { patchTopas(id, d); setMsg(`✓ Sukurta · ${d.connected}/${d.total} sujungta`) } }
  const importContent = async (id: string) => { const d = await act(id, 'import_from_content'); if (d) { patchTopas(id, d); setMsg(`✓ Importuota ${d.imported} įrašų · ${d.connected}/${d.total} sujungta`) } }
  const createEntry = async (id: string, rank: number) => { const d = await act(id, 'create_entry', { rank }); if (d) patchTopas(id, d) }
  const createArtist = async (id: string, rank: number) => { const d = await act(id, 'create_artist', { rank }); if (d) patchTopas(id, d) }
  const removeEntry = async (id: string, rank: number) => { const d = await act(id, 'remove_entry', { rank }); if (d) patchTopas(id, d) }
  const linkEntry = async (id: string, rank: number, hit: AttachmentHit) => { const d = await act(id, 'link_entry', { rank, hit }); if (d) { patchTopas(id, d); setLinkOpen(null) } }
  const addEntry = async (id: string, hit: AttachmentHit) => { const d = await act(id, 'add_entry', { hit }); if (d) { patchTopas(id, d) } }
  const approve = async (id: string, approved: boolean) => {
    const d = await act(id, approved ? 'approve' : 'unapprove')
    if (d) { setItems(p => p.map(t => t.id === id ? { ...t, approved } : t)); if (approved && view === 'todo') setItems(p => p.filter(t => t.id !== id)) }
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black text-gray-900 m-0">Vidiniai topai</h1>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">↻ Atnaujinti</button>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Narių topai susiejami su DB katalogu. <b>Importuoti iš teksto</b> (jei tuščias) / <b>Auto-match</b> →
        trūkstamus <b>sukurti</b> arba susieti rankiniu būdu → <b>Patvirtinti</b>. Tik patvirtinti rodomi homepage.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1.5">
          {([['todo', 'Laukia'], ['approved', 'Patvirtinti'], ['all', 'Visi']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)} className={`text-sm px-3 py-1.5 rounded-lg ${view === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>
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
          <div className="space-y-3">
            {items.map(t => {
              const link = t.blog_slug ? `/blogas/${t.blog_slug}/${t.slug || t.id}` : null
              const allConnected = t.connected === t.total && t.total > 0
              const isBusy = busy === t.id
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
                    <span className={`shrink-0 text-[11px] px-2 py-1 rounded-lg font-semibold ${allConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{t.connected}/{t.total} sujungta</span>
                  </div>

                  {/* Veiksmai */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {t.total === 0 && t.content_entries > 0 && (
                      <button onClick={() => importContent(t.id)} disabled={isBusy}
                        className="text-sm px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">
                        {isBusy ? '…' : `Importuoti iš teksto (${t.content_entries})`}
                      </button>
                    )}
                    {t.total > 0 && <button onClick={() => automatch(t.id)} disabled={isBusy} className="text-sm px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50">{isBusy ? '…' : 'Auto-match'}</button>}
                    {t.unconnected > 0 && <button onClick={() => createMissing(t.id)} disabled={isBusy} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">Sukurti trūkstamus ({t.unconnected})</button>}
                    <button onClick={() => setAddOpen(addOpen === t.id ? null : t.id)} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">+ Pridėti įrašą</button>
                    <div className="ml-auto">
                      {t.approved
                        ? <button onClick={() => approve(t.id, false)} disabled={isBusy} className="text-sm px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">↩ Atšaukti</button>
                        : <button onClick={() => approve(t.id, true)} disabled={isBusy} className={`text-sm px-3 py-1 rounded-lg text-white disabled:opacity-50 ${allConnected ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-900 hover:bg-black'}`}>✓ Patvirtinti{!allConnected ? ' (nepilnas)' : ''}</button>}
                    </div>
                  </div>

                  {/* Pridėti įrašą — picker */}
                  {addOpen === t.id && (
                    <div className="mt-2 p-2 rounded-lg bg-gray-50 border border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Pridėti naują įrašą (daina / albumas / atlikėjas):</div>
                      <MusicSearchPicker compact placeholder="Ieškok…" onAdd={(hit) => addEntry(t.id, hit)} />
                    </div>
                  )}

                  {/* Įrašai inline */}
                  {t.total === 0 ? (
                    <div className="mt-3 text-sm text-gray-400">
                      {t.content_entries > 0 ? 'Nėra struktūrintų įrašų — spausk „Importuoti iš teksto".' : 'Nėra įrašų — pridėk per paiešką arba sukurk topą iš naujo.'}
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-gray-100 pt-2 space-y-1">
                      {t.entries.map(e => {
                        const key = `${t.id}:${e.rank}`
                        const entLabel = e.type === 'album' ? 'Albumas' : e.type === 'artist' ? 'Atlikėjas' : 'Daina'
                        return (
                          <div key={e.rank} className="py-1.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 w-5 text-center text-xs font-bold text-gray-400">{e.rank}</span>
                              {e.image_url
                                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={proxyImg(e.image_url)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                                : <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-gray-800 truncate">{e.title}</div>
                                {e.artist && <div className="text-xs text-gray-500 truncate">{e.artist}</div>}
                              </div>
                              {/* Atlikėjo statusas */}
                              <div className="shrink-0 flex items-center gap-1">
                                {e.artist_ok ? (
                                  <>
                                    <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700" title="Atlikėjas yra DB">✓ atl.</span>
                                    {e.artist_web && <a href={e.artist_web} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-orange-600 text-xs px-1" title="Vieša atlikėjo nuoroda">↗</a>}
                                    {e.artist_admin && <a href={e.artist_admin} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-violet-700 text-xs px-1" title="Redaguoti atlikėją (admin)">✎</a>}
                                  </>
                                ) : (
                                  <button onClick={() => createArtist(t.id, e.rank)} disabled={isBusy} title="Sukurti tik atlikėją (be dainos)"
                                    className="text-[11px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">✗ atl. · Sukurti</button>
                                )}
                              </div>
                              {/* Entiteto (albumas/daina) statusas */}
                              <div className="shrink-0 flex items-center gap-1">
                                {e.entity_ok ? (
                                  <>
                                    <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-700" title={`${entLabel} yra DB`}>✓ {entLabel.slice(0,3).toLowerCase()}.</span>
                                    {e.web_href && <a href={e.web_href} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-orange-600 text-xs px-1" title={`Vieša ${entLabel.toLowerCase()} nuoroda`}>↗</a>}
                                    {e.admin_href && <a href={e.admin_href} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-violet-700 text-xs px-1" title={`Redaguoti (admin)`}>✎</a>}
                                  </>
                                ) : (
                                  <>
                                    <span className="text-[11px] px-1.5 py-0.5 rounded font-semibold bg-red-50 text-red-600" title={`${entLabel} nerasta`}>✗ {entLabel.slice(0,3).toLowerCase()}.</span>
                                    <button onClick={() => createEntry(t.id, e.rank)} disabled={isBusy} title="Sukurti atlikėją + dainą"
                                      className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50">Sukurti</button>
                                  </>
                                )}
                                <button onClick={() => setLinkOpen(linkOpen === key ? null : key)}
                                  className="text-xs px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700">{e.entity_ok ? 'Keisti' : 'Susieti'}</button>
                                <button onClick={() => removeEntry(t.id, e.rank)} disabled={isBusy} title="pašalinti įrašą"
                                  className="text-xs px-1 py-0.5 rounded bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500">✕</button>
                              </div>
                            </div>
                            {linkOpen === key && (
                              <div className="ml-7 mt-1.5 p-2 rounded-lg bg-gray-50 border border-gray-200">
                                <MusicSearchPicker compact placeholder="Ieškok dainos ar atlikėjo…" onAdd={(hit) => linkEntry(t.id, e.rank, hit)} />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {hasMore && (
            <div className="text-center mt-4">
              <button onClick={more} disabled={loadingMore} className="text-sm px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50">{loadingMore ? 'Kraunama…' : 'Rodyti daugiau'}</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
