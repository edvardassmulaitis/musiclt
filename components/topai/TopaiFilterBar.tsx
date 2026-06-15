// components/topai/TopaiFilterBar.tsx
//
// Topų hub'o filtrų eilutė — VIENA kompaktiška pill eilutė: 3 šalių chip'ai
// su vėliavom (LT / JAV / UK) + ketvirtas chip TIK su ikona = Pasaulis
// (vietos taupymui; jokio „baisaus" gaublio emoji — švari linijinė ikona).
// Be „Regionas"/„Tipas" etikečių, be dainų/albumų/Music.lt tipo filtro.
//
// Veikimas — TOGGLE: by default nieko nepažymėta (= /topai rodo viską);
// paspaudus → /topai/<segmentas>; paspaudus aktyvų dar kartą → grįžta į
// /topai (deselect). Kiekvienas chip = TIKRAS <Link> → crawlable SEO
// path-segment puslapis (/topai/lietuva, /topai/jav, /topai/uk,
// /topai/pasaulis).
//
// Self-contained CSS (<style>) — naudojama ir /topai hub'e, ir /top40,
// /top30 pilnų topų puslapiuose, kurie neturi hub'o styles bloko.

import Link from 'next/link'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

const FILTERS: { key: TopaiView; href: string; cc: string; label: string }[] = [
  { key: 'lt', href: '/topai/lietuva', cc: 'lt', label: 'Lietuva' },
  { key: 'us', href: '/topai/jav', cc: 'us', label: 'JAV' },
  { key: 'uk', href: '/topai/uk', cc: 'gb', label: 'UK' },
]

// Švari linijinė pasaulio ikona (ne emoji).
function WorldIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
    </svg>
  )
}

export function TopaiFilterBar({ view }: { view: TopaiView }) {
  const worldOn = view === 'world'
  return (
    <nav className="tpf" aria-label="Topų filtrai">
      <style>{tpfStyles}</style>
      <div className="tpf-chips">
        {FILTERS.map((f) => {
          const on = view === f.key
          // Toggle: aktyvų paspaudus → /topai (nuima filtrą).
          return (
            <Link key={f.key} href={on ? '/topai' : f.href} prefetch={false}
              className={`tpf-chip${on ? ' on' : ''}`}
              aria-current={on ? 'page' : undefined}>
              <span className="tpf-flag" style={{ backgroundImage: `url(https://flagcdn.com/w40/${f.cc}.png)` }} aria-hidden />
              {f.label}
            </Link>
          )
        })}
        {/* Pasaulis — tik ikona (visi lokalūs + bendri pasaulio topai). */}
        <Link href={worldOn ? '/topai' : '/topai/pasaulis'} prefetch={false}
          className={`tpf-chip tpf-chip-ico${worldOn ? ' on' : ''}`}
          aria-current={worldOn ? 'page' : undefined}
          aria-label="Pasaulis" title="Pasaulis">
          <WorldIcon />
        </Link>
      </div>
    </nav>
  )
}

const tpfStyles = `
  .tpf { max-width: var(--page-max, 1280px); margin: 0 auto var(--page-head-gap, 16px); padding: 0 var(--page-pad-x, 20px); }
  .tpf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .tpf-chip { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px 6px 8px; border-radius: 100px; font-size: 13px; font-weight: 600; background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); transition: color .15s, border-color .15s, background .15s; white-space: nowrap; font-family: 'Outfit', sans-serif; text-decoration: none; }
  .tpf-flag { width: 22px; height: 15px; flex-shrink: 0; border-radius: 3px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px rgba(0,0,0,0.08); }
  .tpf-chip-ico { padding: 6px 11px; color: var(--text-muted); }
  .tpf-chip-ico svg { display: block; }
  .tpf-chip:hover { color: var(--text-primary); border-color: rgba(249,115,22,0.4); }
  .tpf-chip.on { background: var(--accent-orange); border-color: var(--accent-orange); color: #fff; }
  @media (max-width: 640px) {
    .tpf { padding: 0 var(--page-pad-x-sm, 14px); }
  }
`
