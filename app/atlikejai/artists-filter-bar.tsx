'use client'
// app/atlikejai/artists-filter-bar.tsx
//
// Kompaktiškas filtrų bar'as virš server-rendered mozaikos. Principas:
// rodom KAS PASIRINKTA, o keitimui atsidaro dropdown'as — neapkraunam
// puslapio dešimtimis visada matomų chip'ų.
//
//  • Rūšiavimas — segmentuoti mygtukai (Tendencijos / Populiariausi / A–Z).
//    Default'as „Tendencijos" (recent_score) — trending atlikėjai.
//  • Šalis — vienas kompaktiškas dropdown'as su paieška (vietoj ~16 chip'ų
//    ir dubliuojančio <select>).
//  • Žanras — chip'ai desktop'e; mobile'e sutraukti į „Žanras ▾" dropdown'ą.
//
// Žanrų / šalių elementai yra realūs <Link> (crawlable → SEO). Sort'as —
// router.push (sort nereikia indeksuoti). Keisdami filtrą perkraunam
// /atlikejai?... URL — rezultatus perskaičiuoja serveris.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { ltSlugify, flagFor, type SortKey } from '@/lib/artist-browse'

type Current = { country: string; genre: string; sort: SortKey }
type CountryCount = { country: string; n: number }
type GenreCount = { genre_id: number; name: string; n: number }

const SORT_BTNS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Tendencijos' },
  { key: 'popular', label: 'Populiariausi' },
  { key: 'name', label: 'A–Z' },
]

// DB žanro pavadinimą → trumpas label (be „muzika"; Rimtoji → Klasika, kad
// sutaptų su nav mega-menu pervadinimu).
function genreLabel(name: string): string {
  const short = name.replace(/\s*muzika$/i, '').trim()
  return short === 'Rimtoji' ? 'Klasika' : short
}

export default function ArtistsFilterBar({
  countries, genres, current, resultCount,
}: {
  countries: CountryCount[]
  genres: GenreCount[]
  current: Current
  resultCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [countryOpen, setCountryOpen] = useState(false)
  const [genreOpen, setGenreOpen] = useState(false)
  const [cq, setCq] = useState('')
  const countryRef = useRef<HTMLDivElement>(null)
  const genreRef = useRef<HTMLDivElement>(null)

  // Click-outside → uždarom dropdown'us
  useEffect(() => {
    if (!countryOpen && !genreOpen) return
    const onDown = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setCountryOpen(false)
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) setGenreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCountryOpen(false); setGenreOpen(false) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [countryOpen, genreOpen])

  // Filtrą keičiantis URL (preserve kitus facet'us + sort'ą; default'us praleidžiam)
  function facetHref(next: { country?: string; genre?: string }): string {
    const country = next.country !== undefined ? next.country : current.country
    const genre = next.genre !== undefined ? next.genre : current.genre
    const u = new URLSearchParams()
    if (country && country !== 'all') u.set('country', country)
    if (genre) u.set('genre', genre)
    if (current.sort && current.sort !== 'recent') u.set('sort', current.sort)
    const s = u.toString()
    return `/atlikejai${s ? `?${s}` : ''}`
  }

  function setSort(sk: SortKey) {
    if (sk === current.sort) return
    const u = new URLSearchParams()
    if (current.country && current.country !== 'all') u.set('country', current.country)
    if (current.genre) u.set('genre', current.genre)
    if (sk !== 'recent') u.set('sort', sk)
    const s = u.toString()
    startTransition(() => router.push(`/atlikejai${s ? `?${s}` : ''}`, { scroll: false }))
  }

  const hasFilters = current.country !== 'all' || !!current.genre || current.sort !== 'recent'

  // ── Šalies pasirinkimo label/flag ──
  function countryDisplay(slug: string): { flag: string; text: string } {
    if (!slug || slug === 'all') return { flag: '🌍', text: 'Visos šalys' }
    if (slug === 'lt') return { flag: '🇱🇹', text: 'Lietuva' }
    if (slug === 'world') return { flag: '🌐', text: 'Užsienis' }
    const c = countries.find((x) => ltSlugify(x.country) === slug)
    return c ? { flag: flagFor(c.country) || '📍', text: c.country } : { flag: '🌍', text: 'Visos šalys' }
  }
  const cd = countryDisplay(current.country)

  // Šalių sąrašas dropdown'ui — pagal kiekį, su paieška
  const sortedCountries = [...countries].sort((a, b) => b.n - a.n)
  const filteredCountries = cq.trim()
    ? sortedCountries.filter((c) => c.country.toLowerCase().includes(cq.trim().toLowerCase()))
    : sortedCountries

  const selectedGenre = current.genre ? genres.find((g) => ltSlugify(g.name) === current.genre) : null
  const genreTrigLabel = selectedGenre ? genreLabel(selectedGenre.name) : 'Visi žanrai'

  // Genre chip'ai — dalinami desktop eilutės ir mobile dropdown'o
  const genreChips = (onClick?: () => void) => (
    <>
      <Link href={facetHref({ genre: '' })} onClick={onClick}
        className={`afb-chip${!current.genre ? ' on' : ''}`} prefetch={false}>Visi</Link>
      {genres.map((g) => {
        const slug = ltSlugify(g.name)
        return (
          <Link key={g.genre_id} href={facetHref({ genre: slug })} onClick={onClick}
            className={`afb-chip${current.genre === slug ? ' on' : ''}`} prefetch={false}>
            {genreLabel(g.name)}
          </Link>
        )
      })}
    </>
  )

  return (
    <div className={isPending ? 'afb busy' : 'afb'}>
      <style>{afbStyles}</style>

      {/* ── 1 eilutė: rūšiavimo mygtukai + šalies dropdown + (mobile) žanro dropdown ── */}
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

        {/* Šalies dropdown */}
        <div className="afb-dd" ref={countryRef}>
          <button type="button" className={`afb-trig${current.country !== 'all' ? ' active' : ''}`}
            onClick={() => { setCountryOpen((o) => !o); setGenreOpen(false) }}
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
                    <Link href={facetHref({ country: 'world' })} onClick={() => setCountryOpen(false)} className={`afb-opt${current.country === 'world' ? ' on' : ''}`} prefetch={false}><span>🌐</span> Užsienis</Link>
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

        {/* Žanro dropdown — TIK mobile (desktop'e rodom chip'ų eilutę žemiau) */}
        <div className="afb-dd afb-mob" ref={genreRef}>
          <button type="button" className={`afb-trig${current.genre ? ' active' : ''}`}
            onClick={() => { setGenreOpen((o) => !o); setCountryOpen(false) }}
            aria-expanded={genreOpen} aria-haspopup="listbox">
            <span className="afb-trig-text">{genreTrigLabel}</span>
            <svg className="afb-caret" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
          {genreOpen && (
            <div className="afb-pop">
              <div className="afb-pop-chips">{genreChips(() => setGenreOpen(false))}</div>
            </div>
          )}
        </div>

        {hasFilters && (
          <Link href="/atlikejai" className="afb-clear" prefetch={false} onClick={() => { setCountryOpen(false); setGenreOpen(false) }}>✕ Išvalyti</Link>
        )}
        <span className="afb-count">{resultCount.toLocaleString('lt-LT')} atlikėjų</span>
      </div>

      {/* ── 2 eilutė: žanro chip'ai — TIK desktop ── */}
      <div className="afb-genre-row afb-desk">
        <span className="afb-genre-lbl">Žanras</span>
        {genreChips()}
      </div>
    </div>
  )
}

const afbStyles = `
.afb { max-width:1400px; margin:14px auto 0; padding:0 24px; display:flex; flex-direction:column; gap:10px; }
.afb.busy { opacity:.55; transition:opacity .1s; }
.afb-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

/* Segmentuoti rūšiavimo mygtukai */
.afb-seg { display:inline-flex; padding:3px; gap:2px; border-radius:12px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); }
.afb-seg-btn { padding:7px 14px; border:none; background:transparent; color:var(--text-secondary); font-size:12.5px; font-weight:700; font-family:'Outfit',sans-serif; border-radius:9px; cursor:pointer; transition:all .15s; white-space:nowrap; }
.afb-seg-btn:hover { color:var(--text-primary); }
.afb-seg-btn.on { background:var(--accent-orange); color:#fff; box-shadow:0 2px 8px rgba(249,115,22,.28); }

/* Dropdown trigeris (šalis / žanras) */
.afb-dd { position:relative; }
.afb-trig { display:inline-flex; align-items:center; gap:7px; height:40px; padding:0 12px; border-radius:11px; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); font-size:12.5px; font-weight:600; font-family:'Outfit',sans-serif; cursor:pointer; transition:all .15s; }
.afb-trig:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.afb-trig.active { color:var(--text-primary); border-color:rgba(249,115,22,0.55); background:rgba(249,115,22,0.10); }
.afb-trig-flag { font-size:14px; line-height:1; }
.afb-trig-text { max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.afb-caret { opacity:.6; flex-shrink:0; }

/* Popover panelė */
.afb-pop { position:absolute; top:calc(100% + 6px); left:0; z-index:120; min-width:240px; background:var(--modal-bg,var(--bg-elevated)); border:1px solid var(--modal-border,var(--border-default,rgba(255,255,255,0.1))); border-radius:14px; box-shadow:var(--modal-shadow,0 18px 50px rgba(0,0,0,.5)); overflow:hidden; }
.afb-pop-country { width:300px; }
.afb-pop-search { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border-default,rgba(255,255,255,0.07)); color:var(--text-faint); }
.afb-pop-search input { flex:1; border:none; background:transparent; outline:none; color:var(--text-primary); font-size:13px; font-family:'DM Sans',sans-serif; }
.afb-pop-search input::placeholder { color:var(--text-faint); }
.afb-pop-list { max-height:340px; overflow-y:auto; padding:6px; }
.afb-opt { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:9px; font-size:13px; font-weight:600; color:var(--text-secondary); cursor:pointer; transition:background .12s,color .12s; }
.afb-opt:hover { background:var(--bg-hover); color:var(--text-primary); }
.afb-opt.on { background:rgba(249,115,22,0.14); color:var(--accent-orange); }
.afb-opt-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.afb-opt-n { font-size:11.5px; font-weight:600; color:var(--text-faint); }
.afb-pop-div { height:1px; background:var(--border-default,rgba(255,255,255,0.08)); margin:6px 4px; }
.afb-pop-empty { padding:18px; text-align:center; color:var(--text-faint); font-size:12.5px; }
.afb-pop-chips { display:flex; flex-wrap:wrap; gap:7px; padding:12px; max-width:320px; }

/* Žanro chip'ai */
.afb-genre-row { display:flex; flex-wrap:wrap; gap:7px; align-items:center; }
.afb-genre-lbl { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); margin-right:2px; }
.afb-chip { padding:6px 13px; border-radius:100px; font-size:12.5px; font-weight:600; background:var(--bg-hover); border:1px solid var(--border-default,rgba(255,255,255,0.08)); color:var(--text-secondary); transition:all .15s; white-space:nowrap; font-family:'Outfit',sans-serif; }
.afb-chip:hover { color:var(--text-primary); border-color:rgba(249,115,22,0.4); }
.afb-chip.on { background:var(--accent-orange); border-color:var(--accent-orange); color:#fff; }

.afb-clear { height:40px; display:inline-flex; align-items:center; padding:0 14px; border-radius:11px; font-size:12px; font-weight:700; background:rgba(249,115,22,0.12); border:1px solid rgba(249,115,22,0.25); color:var(--accent-orange); cursor:pointer; font-family:'Outfit',sans-serif; }
.afb-clear:hover { background:rgba(249,115,22,0.2); }
.afb-count { margin-left:auto; font-size:12px; font-weight:600; color:var(--text-faint); white-space:nowrap; }

/* Responsive: žanras chip'ai desktop / dropdown mobile */
.afb-mob { display:none; }
@media(max-width:767px){
  .afb-desk { display:none; }
  .afb-mob { display:block; }
  .afb-pop-country { width:min(300px, calc(100vw - 48px)); }
  .afb-trig-text { max-width:120px; }
  .afb-count { width:100%; margin:0; text-align:right; }
}
`
