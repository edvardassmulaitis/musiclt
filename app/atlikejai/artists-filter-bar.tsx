'use client'
// app/atlikejai/artists-filter-bar.tsx
//
// Kompaktiškas filtrų bar'as virš server-rendered mozaikos. Principas: rodom
// KAS PASIRINKTA, keitimui atsidaro dropdown'as.
//
//  • Rūšiavimas — segmentuoti mygtukai (Populiariausi / Ant bangos).
//    Default'as „Populiariausi" (score, all-time).
//  • Šalis — dropdown su paieška.
//  • Stilius — dropdown su paieška IR sub-stiliais (8 pagrindiniai stiliai,
//    kiekvienas išskleidžiamas į savo sub-stilius su atlikėjų skaičiais).
//
// Pasirinkimai — realūs <Link> (crawlable → SEO). Sort'as — router.push.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ltSlugify, flagFor, type SortKey } from '@/lib/artist-browse'
import { SUBSTYLES } from '@/lib/constants'

type Current = { country: string; genre: string; substyle: string; sort: SortKey }
type CountryCount = { country: string; n: number }
type GenreCount = { genre_id: number; name: string; n: number }
type SubstyleCount = { substyle_id: number; name: string; slug: string; n: number }

const SORT_BTNS: { key: SortKey; label: string }[] = [
  { key: 'popular', label: 'Populiariausi' },
  { key: 'recent', label: 'Ant bangos' },
]

// substyle name (lower) → pagrindinis stilius (iš SUBSTYLES konstantos)
const SUBSTYLE_PARENT: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const [genre, subs] of Object.entries(SUBSTYLES)) for (const s of subs) m[s.toLowerCase()] = genre
  return m
})()
const OTHER_GENRE = 'Kitų stilių muzika'

// DB stiliaus pavadinimą → trumpas label (be „muzika"; Rimtoji → Klasika).
function genreLabel(name: string): string {
  const short = name.replace(/\s*muzika$/i, '').trim()
  return short === 'Rimtoji' ? 'Klasika' : short
}

export default function ArtistsFilterBar({
  countries, genres, substyles, current, resultCount,
}: {
  countries: CountryCount[]
  genres: GenreCount[]
  substyles: SubstyleCount[]
  current: Current
  resultCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [countryOpen, setCountryOpen] = useState(false)
  const [styleOpen, setStyleOpen] = useState(false)
  const [cq, setCq] = useState('')
  const [sq, setSq] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const countryRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!countryOpen && !styleOpen) return
    const onDown = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false)
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCountryOpen(false); setStyleOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [countryOpen, styleOpen])

  // Filtrą keičiantis URL (preserve kitus facet'us + sort'ą; default'us praleidžiam)
  function facetHref(next: { country?: string; genre?: string; substyle?: string }): string {
    const country = next.country !== undefined ? next.country : current.country
    const genre = next.genre !== undefined ? next.genre : current.genre
    const substyle = next.substyle !== undefined ? next.substyle : current.substyle
    const u = new URLSearchParams()
    if (country && country !== 'all') u.set('country', country)
    if (substyle) u.set('substyle', substyle)
    else if (genre) u.set('genre', genre)
    if (current.sort && current.sort !== 'popular') u.set('sort', current.sort)
    const s = u.toString()
    return `/atlikejai${s ? `?${s}` : ''}`
  }

  function setSort(sk: SortKey) {
    if (sk === current.sort) return
    const u = new URLSearchParams()
    if (current.country && current.country !== 'all') u.set('country', current.country)
    if (current.substyle) u.set('substyle', current.substyle)
    else if (current.genre) u.set('genre', current.genre)
    if (sk !== 'popular') u.set('sort', sk)
    const s = u.toString()
    startTransition(() => router.push(`/atlikejai${s ? `?${s}` : ''}`, { scroll: false }))
  }

  const hasFilters = current.country !== 'all' || !!current.genre || !!current.substyle || current.sort !== 'popular'

  // ── Šalis ──
  function countryDisplay(slug: string): { flag: string; text: string } {
    if (!slug || slug === 'all') return { flag: '🌍', text: 'Visos šalys' }
    if (slug === 'lt') return { flag: '🇱🇹', text: 'Lietuva' }
    if (slug === 'world') return { flag: '🌐', text: 'Pasaulis' }
    const c = countries.find((x) => ltSlugify(x.country) === slug)
    return c ? { flag: flagFor(c.country) || '📍', text: c.country } : { flag: '🌍', text: 'Visos šalys' }
  }
  const cd = countryDisplay(current.country)
  const sortedCountries = [...countries].sort((a, b) => b.n - a.n)
  const filteredCountries = cq.trim()
    ? sortedCountries.filter((c) => c.country.toLowerCase().includes(cq.trim().toLowerCase()))
    : sortedCountries

  // ── Stilius (+ sub-stiliai) ──
  const subsByGenre = useMemo(() => {
    const m: Record<string, SubstyleCount[]> = {}
    for (const s of substyles) {
      const parent = SUBSTYLE_PARENT[s.name.toLowerCase()] || OTHER_GENRE
      const arr = m[parent] ?? (m[parent] = [])
      arr.push(s)
    }
    return m
  }, [substyles])

  const selectedSub = current.substyle ? substyles.find((s) => s.slug === current.substyle) || null : null
  const selectedGenre = !selectedSub && current.genre ? genres.find((g) => ltSlugify(g.name) === current.genre) || null : null
  const styleTrig = selectedSub ? selectedSub.name : selectedGenre ? genreLabel(selectedGenre.name) : 'Visi stiliai'

  const sqv = sq.trim().toLowerCase()
  const matchSubs = (genreName: string): SubstyleCount[] => {
    const list = subsByGenre[genreName] || []
    return sqv ? list.filter((s) => s.name.toLowerCase().includes(sqv)) : list
  }
  const genreMatches = (g: GenreCount) =>
    !sqv || genreLabel(g.name).toLowerCase().includes(sqv) || g.name.toLowerCase().includes(sqv)

  const toggleExpand = (name: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  const closeStyle = () => setStyleOpen(false)

  return (
    <div className={isPending ? 'afb busy' : 'afb'}>
      <style>{afbStyles}</style>

      <div className="afb-row">
        <div className="afb-seg" role="group" aria-label="Rūšiavimas">
          {SORT_BTNS.map((s) => (
            <button key={s.key} type="button"
              className={`afb-seg-btn${current.sort === s.key ? ' on' : ''}`}
              onClick={() => setSort(s.key)} aria-pressed={current.sort === s.key}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ── Šalies dropdown ── */}
        <div className="afb-dd" ref={countryRef}>
          <button type="button" className={`afb-trig${current.country !== 'all' ? ' active' : ''}`}
            onClick={() => { setCountryOpen((o) => !o); setStyleOpen(false) }}
            aria-expanded={countryOpen} aria-haspopup="listbox">
            <span className="afb-trig-flag">{cd.flag}</span>
            <span className="afb-trig-text">{cd.text}</span>
            <svg className="afb-caret" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          {countryOpen && (
            <div className="afb-pop afb-pop-country">
              <div className="afb-pop-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                <input autoFocus value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Ieškoti šalies…" aria-label="Ieškoti šalies" />
              </div>
              <div className="afb-pop-list">
                {!cq.trim() && (
                  <>
                    <Link href={facetHref({ country: 'all' })} onClick={() => setCountryOpen(false)} className={`afb-opt${current.country === 'all' ? ' on' : ''}`} prefetch={false}><span>🌍</span> Visos šalys</Link>
                    <Link href={facetHref({ country: 'lt' })} onClick={() => setCountryOpen(false)} className={`afb-opt${current.country === 'lt' ? ' on' : ''}`} prefetch={false}><span>🇱🇹</span> Lietuva</Link>
                    <Link href={facetHref({ country: 'world' })} onClick={() => setCountryOpen(false)} className={`afb-opt${current.country === 'world' ? ' on' : ''}`} prefetch={false}><span>🌐</span> Pasaulis</Link>
                    <div className="afb-pop-div" />
                  </>
                )}
                {filteredCountries.map((c) => {
                  const slug = ltSlugify(c.country)
                  return (
                    <Link key={c.country} href={facetHref({ country: slug })} onClick={() => setCountryOpen(false)} className={`afb-opt${current.country === slug ? ' on' : ''}`} prefetch={false}>
                      <span>{flagFor(c.country) || '📍'}</span>
                      <span className="afb-opt-name">{c.country}</span>
                      <span className="afb-opt-n">{c.n.toLocaleString('lt-LT')}</span>
                    </Link>
                  )
                })}
                {filteredCountries.length === 0 && <div className="afb-pop-empty">Nieko nerasta</div>}
              </div>
            </div>
          )}
        </div>

        {/* ── Stiliaus dropdown (su sub-stiliais) ── */}
        <div className="afb-dd" ref={styleRef}>
          <button type="button" className={`afb-trig${(current.genre || current.substyle) ? ' active' : ''}`}
            onClick={() => { setStyleOpen((o) => !o); setCountryOpen(false) }}
            aria-expanded={styleOpen} aria-haspopup="listbox">
            <span className="afb-trig-text">{styleTrig}</span>
            <svg className="afb-caret" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          {styleOpen && (
            <div className="afb-pop afb-pop-style">
              <div className="afb-pop-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
                <input autoFocus value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Ieškoti stiliaus ar sub-stiliaus…" aria-label="Ieškoti stiliaus" />
              </div>
              <div className="afb-pop-list">
                {!sqv && (
                  <Link href={facetHref({ genre: '', substyle: '' })} onClick={closeStyle} className={`afb-opt${!current.genre && !current.substyle ? ' on' : ''}`} prefetch={false}>Visi stiliai</Link>
                )}
                {genres.map((g) => {
                  const subs = matchSubs(g.name)
                  const gMatch = genreMatches(g)
                  if (sqv && !gMatch && subs.length === 0) return null
                  const isExpanded = sqv ? true : expanded.has(g.name)
                  const genreSlug = ltSlugify(g.name)
                  const genreSel = !current.substyle && current.genre === genreSlug
                  return (
                    <div key={g.genre_id} className="afb-grp">
                      <div className={`afb-opt afb-opt-parent${genreSel ? ' on' : ''}`}>
                        <Link href={facetHref({ genre: genreSlug, substyle: '' })} onClick={closeStyle} className="afb-opt-main" prefetch={false}>
                          <span className="afb-opt-name">{genreLabel(g.name)}</span>
                          <span className="afb-opt-n">{g.n.toLocaleString('lt-LT')}</span>
                        </Link>
                        {subs.length > 0 && !sqv && (
                          <button type="button" className={`afb-exp${isExpanded ? ' open' : ''}`} aria-label="Išskleisti sub-stilius" onClick={() => toggleExpand(g.name)}>
                            <svg width="11" height="7" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                          </button>
                        )}
                      </div>
                      {isExpanded && subs.map((s) => (
                        <Link key={s.substyle_id} href={facetHref({ substyle: s.slug, genre: '' })} onClick={closeStyle} className={`afb-opt afb-opt-sub${current.substyle === s.slug ? ' on' : ''}`} prefetch={false}>
                          <span className="afb-opt-name">{s.name}</span>
                          <span className="afb-opt-n">{s.n.toLocaleString('lt-LT')}</span>
                        </Link>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {hasFilters && (
          <Link href="/atlikejai" className="afb-clear" prefetch={false} onClick={() => { setCountryOpen(false); setStyleOpen(false) }}>✕ Išvalyti</Link>
        )}
        <span className="afb-count">{resultCount.toLocaleString('lt-LT')} atlikėjų</span>
      </div>
    </div>
  )
}

const afbStyles = `
.afb { max-width:1400px; margin:14px auto 0; padding:0 24px; }
.afb.busy { opacity:.55; transition:opacity .1s; }
.afb-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

.afb-seg { display:inline-flex; padding:3px; gap:2px; border-radius:12px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.afb-seg-btn { padding:7px 14px; border:none; background:transparent; color:var(--text-secondary); font-size:12.5px; font-weight:700; font-family:'Outfit',sans-serif; border-radius:9px; cursor:pointer; transition:all .15s; white-space:nowrap; }
.afb-seg-btn:hover { color:var(--text-primary); }
.afb-seg-btn.on { background:var(--accent-orange); color:#fff; box-shadow:0 2px 8px rgba(249,115,22,.28); }

.afb-dd { position:relative; }
.afb-trig { display:inline-flex; align-items:center; gap:7px; height:40px; padding:0 12px; border-radius:11px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); font-size:12.5px; font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .15s; }
.afb-trig:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.afb-trig.active { color:var(--text-primary); border-color:rgba(249,115,22,0.55); background:rgba(249,115,22,0.10); }
.afb-trig-flag { font-size:14px; line-height:1; }
.afb-trig-text { max-width:170px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.afb-caret { opacity:.6; flex-shrink:0; }

.afb-pop { position:absolute; top:calc(100% + 6px); left:0; z-index:120; min-width:240px; background:var(--modal-bg,var(--bg-elevated)); border:1px solid var(--modal-border,var(--border-default,rgba(255,255,255,0.1))); border-radius:14px; box-shadow:var(--modal-shadow,0 18px 50px rgba(0,0,0,.5)); overflow:hidden; }
.afb-pop-country { width:300px; }
.afb-pop-style { width:320px; }
.afb-pop-search { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border-default,rgba(255,255,255,0.07)); color:var(--text-faint); }
.afb-pop-search input { flex:1; border:none; background:transparent; outline:none; color:var(--text-primary); font-size:13px; font-family:'DM Sans',sans-serif; }
.afb-pop-search input::placeholder { color:var(--text-faint); }
.afb-pop-list { max-height:360px; overflow-y:auto; padding:6px; }
.afb-opt { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:9px; font-size:13px; font-weight:600; color:var(--text-secondary); cursor:pointer; transition:background .12s,color .12s; }
.afb-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.afb-opt.on { background:rgba(249,115,22,0.14); color:var(--accent-orange); }
.afb-opt-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.afb-opt-n { font-size:11.5px; font-weight:600; color:var(--text-faint); }
.afb-pop-div { height:1px; background:var(--border-default,rgba(255,255,255,0.08)); margin:6px 4px; }
.afb-pop-empty { padding:18px; text-align:center; color:var(--text-faint); font-size:12.5px; }

/* Stiliaus grupė: pagrindinis stilius (bold) + išskleidžiamas sub-stilių sąrašas */
.afb-grp { margin-bottom:1px; }
.afb-opt-parent { padding:2px; gap:2px; font-weight:700; }
.afb-opt-main { flex:1; display:flex; align-items:center; gap:9px; padding:7px 8px; border-radius:8px; color:inherit; text-decoration:none; min-width:0; }
.afb-opt-main:hover { background:var(--bg-hover); }
.afb-opt-parent.on .afb-opt-main { color:var(--accent-orange); }
.afb-exp { flex-shrink:0; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:var(--text-faint); cursor:pointer; border-radius:8px; transition:background .12s,transform .15s; }
.afb-exp:hover { background:var(--bg-hover); color:var(--text-secondary); }
.afb-exp.open { transform:rotate(180deg); }
.afb-opt-sub { margin-left:10px; padding-left:16px; font-weight:500; font-size:12.5px; border-left:1px solid var(--border-default,rgba(255,255,255,0.08)); border-radius:0 8px 8px 0; }

.afb-clear { height:40px; display:inline-flex; align-items:center; padding:0 14px; border-radius:11px; font-size:12px; font-weight:700; background:rgba(249,115,22,0.12); border:1px solid rgba(249,115,22,0.25); color:var(--accent-orange); cursor:pointer; font-family:'Outfit',sans-serif; }
.afb-clear:hover { background:rgba(249,115,22,0.2); }
.afb-count { margin-left:auto; font-size:12px; font-weight:600; color:var(--text-faint); white-space:nowrap; }

@media(max-width:680px){
  .afb-pop-country, .afb-pop-style { width:min(320px, calc(100vw - 48px)); }
  .afb-trig-text { max-width:120px; }
  .afb-count { width:100%; margin:0; text-align:right; }
}
`
