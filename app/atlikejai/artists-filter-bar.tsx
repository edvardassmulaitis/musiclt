'use client'
// app/atlikejai/artists-filter-bar.tsx
//
// Mažas client island'as virš server-rendered mozaikos. Keisdamas bet kurį
// filtrą daro router.push į naują /atlikejai?... URL — taip rezultatus
// perskaičiuoja serveris (SEO + back-button veikia natūraliai). Paieška
// debounce'inama, kad nešaudytume navigacijos kiekvienam paspaudimui.

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ltSlugify, SORTS, type SortKey } from '@/lib/artist-browse'

type Current = { country: string; genre: string; type: string; sort: SortKey; q: string }

export default function ArtistsFilterBar({
  countries, current, resultCount,
}: {
  countries: { country: string; n: number }[]
  current: Current
  resultCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState(current.q)
  const firstRender = useRef(true)

  function navigate(next: Partial<Current>) {
    const merged = { ...current, q, ...next }
    const u = new URLSearchParams()
    if (merged.country && merged.country !== 'all') u.set('country', merged.country)
    if (merged.genre) u.set('genre', merged.genre)
    if (merged.type && merged.type !== 'all') u.set('type', merged.type)
    if (merged.sort && merged.sort !== 'popular') u.set('sort', merged.sort)
    if (merged.q.trim()) u.set('q', merged.q.trim())
    const s = u.toString()
    startTransition(() => router.push(`/atlikejai${s ? `?${s}` : ''}`, { scroll: false }))
  }

  // Debounce paieškos navigaciją
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const t = setTimeout(() => {
      if (q.trim() !== current.q.trim()) navigate({ q })
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const hasFilters = current.country !== 'all' || !!current.genre || current.type !== 'all' || current.sort !== 'popular' || !!current.q

  // Šalių sąrašas dropdown'ui — top pagal kiekį + visada įtraukiam pasirinktą.
  const countryOpts = countries.slice(0, 60)
  if (current.country && current.country !== 'all' && current.country !== 'lt' && current.country !== 'world') {
    const sel = countries.find((c) => ltSlugify(c.country) === current.country)
    if (sel && !countryOpts.includes(sel)) countryOpts.unshift(sel)
  }

  return (
    <div className={isPending ? 'afb busy' : 'afb'}>
      <style>{`
        .afb { max-width:1400px; margin:14px auto 0; padding:0 24px; display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .afb-search { position:relative; flex:1; min-width:200px; max-width:340px; }
        .afb-search input { width:100%; height:40px; padding:0 14px 0 38px; border-radius:11px; font-size:13px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-primary); outline:none; font-family:'DM Sans',sans-serif; }
        .afb-search input:focus { border-color:rgba(249,115,22,0.5); }
        .afb-search input::placeholder { color:var(--text-faint); }
        .afb-search svg { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--text-faint); pointer-events:none; }
        .afb-sel { height:40px; padding:0 30px 0 13px; border-radius:11px; font-size:12.5px; font-weight:600; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); outline:none; cursor:pointer; appearance:none; font-family:'Outfit',sans-serif; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%236889a8' stroke-width='1.5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; }
        .afb-sel:focus { border-color:rgba(249,115,22,0.5); }
        .afb-clear { height:40px; padding:0 14px; border-radius:11px; font-size:12px; font-weight:700; background:rgba(249,115,22,0.12); border:1px solid rgba(249,115,22,0.25); color:var(--accent-orange); cursor:pointer; font-family:'Outfit',sans-serif; }
        .afb-clear:hover { background:rgba(249,115,22,0.2); }
        .afb-count { margin-left:auto; font-size:12px; font-weight:600; color:var(--text-faint); }
        .afb.busy { opacity:.6; transition:opacity .1s; }
        @media(max-width:680px){ .afb-search{ max-width:100%; } .afb-count{ width:100%; margin:0; text-align:right; } }
      `}</style>

        <div className="afb-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Ieškoti atlikėjo…" aria-label="Ieškoti atlikėjo"
          />
        </div>

        <select className="afb-sel" value={current.sort} onChange={(e) => navigate({ sort: e.target.value as SortKey })} aria-label="Rūšiavimas">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <select className="afb-sel" value={current.type} onChange={(e) => navigate({ type: e.target.value })} aria-label="Tipas">
          <option value="all">Visi tipai</option>
          <option value="solo">🎤 Solo</option>
          <option value="group">🎸 Grupės</option>
        </select>

        <select
          className="afb-sel"
          value={current.country}
          onChange={(e) => navigate({ country: e.target.value })}
          aria-label="Šalis"
        >
          <option value="all">🌍 Visos šalys</option>
          <option value="lt">🇱🇹 Lietuva</option>
          <option value="world">🌐 Užsienis</option>
          <optgroup label="Šalys">
            {countryOpts.map((c) => (
              <option key={c.country} value={ltSlugify(c.country)}>{c.country} ({c.n})</option>
            ))}
          </optgroup>
        </select>

        {hasFilters && (
          <button className="afb-clear" onClick={() => { setQ(''); startTransition(() => router.push('/atlikejai', { scroll: false })) }}>
            ✕ Išvalyti
          </button>
        )}
        <span className="afb-count">{resultCount.toLocaleString('lt-LT')} atlikėjų</span>
    </div>
  )
}
