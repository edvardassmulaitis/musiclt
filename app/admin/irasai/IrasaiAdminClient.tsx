'use client'
// app/admin/irasai/IrasaiAdminClient.tsx
// Narių įrašų tipų priskyrimas + topų normalizavimas (legacy plain-text → entity formatas su automatch).

import { useEffect, useState, useCallback } from 'react'

type TopasInfo = { format: 'empty' | 'legacy' | 'new' | 'mixed'; total: number; matched: number; unmatched: number }
type Item = {
  id: string
  title: string
  blog_slug: string | null
  slug: string | null
  post_type: string
  editorial_type: string | null
  status: string
  published_at: string | null
  author: string | null
  hidden: boolean
  has_album: boolean
  has_event: boolean
  topas: TopasInfo | null
}

const POST_TYPES = [
  { v: 'article', l: 'Įrašas (article)' },
  { v: 'topas', l: 'Topas' },
  { v: 'review', l: 'Apžvalga (review)' },
  { v: 'creation', l: 'Kūryba' },
  { v: 'translation', l: 'Vertimas' },
  { v: 'event', l: 'Renginys' },
]
const EDITORIAL = [
  { v: 'kita', l: 'Bendruomenės įrašas (nerodomas homepage)' },
  { v: 'recenzija', l: 'Muzikos apžvalga' },
  { v: 'koncertai', l: 'Koncertų įspūdžiai' },
]

// Kaip homepage atvaizduos šį įrašą (TypeStrip label) — kad adminas matytų rezultatą.
function homepageLabel(it: Item): { label: string; shown: boolean } {
  if (it.hidden) return { label: 'Narys paslėptas', shown: false }
  if (it.post_type === 'event') return { label: 'Renginys (tik /atrasti)', shown: false }
  if (it.post_type === 'article') {
    if (it.editorial_type === 'recenzija') return { label: 'Muzikos apžvalga', shown: true }
    if (it.editorial_type === 'koncertai') return { label: 'Koncertų įspūdžiai', shown: true }
    return { label: 'Įrašas (tik /atrasti)', shown: false }
  }
  if (it.post_type === 'topas') return { label: 'Topas', shown: true }
  if (it.post_type === 'review') return { label: 'Apžvalga', shown: true }
  if (it.post_type === 'creation') return { label: 'Kūryba', shown: true }
  if (it.post_type === 'translation') return { label: 'Vertimas', shown: true }
  return { label: '—', shown: false }
}

const fmtBadge: Record<string, { l: string; c: string }> = {
  empty: { l: 'tuščias', c: 'bg-gray-100 text-gray-500' },
  legacy: { l: 'legacy plain-text', c: 'bg-amber-100 text-amber-700' },
  mixed: { l: 'mišrus', c: 'bg-orange-100 text-orange-700' },
  new: { l: 'naujas formatas', c: 'bg-emerald-100 text-emerald-700' },
}

export default function IrasaiAdminClient() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'todo' | 'topas'>('todo')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/irasai', { cache: 'no-store' })
      const d = await r.json()
      setItems(Array.isArray(d.items) ? d.items : [])
    } catch { setItems([]) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const patch = async (id: string, body: any) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'klaida')
      setItems(prev => prev.map(it => it.id === id ? { ...it, ...body, editorial_type: 'editorial_type' in body ? (body.editorial_type === 'kita' ? null : body.editorial_type) : it.editorial_type } : it))
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  const normalize = async (id: string) => {
    setBusy(id); setMsg(null)
    try {
      const r = await fetch('/api/admin/irasai/normalize-topas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'klaida')
      const s = d.summary
      setMsg(`✓ Normalizuota: ${s.matched} sutapo · ${s.artist_only} tik atlikėjas (trūksta dainos) · ${s.unmatched} nerasta${s.kept ? ` · ${s.kept} jau buvo` : ''}`)
      await load()
    } catch (e: any) { setMsg('Klaida: ' + e.message) }
    setBusy(null)
  }

  const shown = items.filter(it => {
    if (filter === 'topas') return it.post_type === 'topas'
    if (filter === 'todo') {
      // Reikia dėmesio: article be muzikinio editorial_type, arba legacy/mišrus topas
      if (it.post_type === 'article' && it.editorial_type !== 'recenzija' && it.editorial_type !== 'koncertai') return true
      if (it.post_type === 'topas' && it.topas && it.topas.format !== 'new') return true
      return false
    }
    return true
  })

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-black text-gray-900 m-0">Narių įrašai</h1>
        <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">↻ Atnaujinti</button>
      </div>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        Priskirk teisingą tipą — homepage Bendruomenės juosta rodo po 1 naujausią <b>kiekvieno tipo</b> įrašą.
        „Bendruomenės įrašas" (article be muzikinio tipo) ir renginiai homepage nerodomi.
      </p>

      <div className="flex gap-1.5 mb-4">
        {([['todo', 'Reikia tvarkyti'], ['topas', 'Topai'], ['all', 'Visi']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`text-sm px-3 py-1.5 rounded-lg ${filter === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {l}{v === 'todo' ? ` (${items.filter(it => (it.post_type === 'article' && it.editorial_type !== 'recenzija' && it.editorial_type !== 'koncertai') || (it.post_type === 'topas' && it.topas && it.topas.format !== 'new')).length})` : ''}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-blue-50 text-blue-800 border border-blue-100">{msg}</div>}

      {loading ? (
        <div className="text-gray-400 text-sm py-10 text-center">Kraunama…</div>
      ) : shown.length === 0 ? (
        <div className="text-gray-400 text-sm py-10 text-center">Nieko nerasta šiame filtre.</div>
      ) : (
        <div className="space-y-2">
          {shown.map(it => {
            const hp = homepageLabel(it)
            const link = it.blog_slug ? `/blogas/${it.blog_slug}/${it.slug || it.id}` : null
            return (
              <div key={it.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {link
                        ? <a href={link} target="_blank" rel="noreferrer" className="font-bold text-gray-900 hover:text-orange-600 truncate">{it.title}</a>
                        : <span className="font-bold text-gray-900 truncate">{it.title}</span>}
                      {it.hidden && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">narys paslėptas</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {it.author || 'be autoriaus'} · {it.published_at ? new Date(it.published_at).toLocaleDateString('lt-LT') : 'nepublikuotas'}
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] px-2 py-1 rounded-lg font-semibold ${hp.shown ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {hp.shown ? '● homepage: ' : '○ '}{hp.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <label className="text-xs text-gray-500">Tipas
                    <select value={it.post_type} disabled={busy === it.id}
                      onChange={e => patch(it.id, { post_type: e.target.value })}
                      className="ml-1 text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white">
                      {POST_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                    </select>
                  </label>

                  {it.post_type === 'article' && (
                    <label className="text-xs text-gray-500">Kategorija
                      <select value={it.editorial_type || 'kita'} disabled={busy === it.id}
                        onChange={e => patch(it.id, { editorial_type: e.target.value })}
                        className="ml-1 text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white">
                        {EDITORIAL.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                    </label>
                  )}

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
                </div>

                {it.post_type === 'topas' && it.topas && it.topas.unmatched > 0 && it.topas.format === 'new' && (
                  <div className="mt-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
                    🚩 {it.topas.unmatched} įrašų be DB dainos — placeholder'iai. Kai scrape įkels daugiau dainų, paspausk „Pernormalizuoti".
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
