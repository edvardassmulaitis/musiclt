// components/topai/TopaiFilterBar.tsx
//
// Topų hub'o filtrų eilutė — VIENA kompaktiška pill eilutė: 3 šalių chip'ai
// su vėliavom (LT / JAV / UK) + ketvirtas chip TIK su ikona = Pasaulis.
//
// Naudoja BENDRĄ filtrų sistemą (.flt-* iš globals.css) — vienoda su /srautas,
// /muzika, /renginiai, /naujienos, /atlikejai. Be „Visi" — by default nieko
// nepažymėta (= /topai rodo viską). TOGGLE: aktyvų dar kartą → grįžta į /topai.
// Kiekvienas chip = TIKRAS <Link> → crawlable SEO path-segment puslapis.

import Link from 'next/link'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

const FILTERS: { key: TopaiView; href: string; cc: string; label: string }[] = [
  { key: 'lt', href: '/topai/lietuva', cc: 'lt', label: 'LT' },
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
      <style>{`.tpf { max-width: var(--page-max, 1280px); margin: 0 auto var(--page-head-gap, 16px); padding: 0 var(--page-pad-x, 20px); }
        @media (max-width: 640px) { .tpf { padding: 0 var(--page-pad-x-sm, 14px); } }`}</style>
      <div className="flt-bar">
        {FILTERS.map((f) => {
          const on = view === f.key
          // Toggle: aktyvų paspaudus → /topai (nuima filtrą).
          return (
            <Link key={f.key} href={on ? '/topai' : f.href} prefetch={false}
              className={`flt-chip${on ? ' on' : ''}`}
              aria-current={on ? 'page' : undefined}>
              <span className="flt-flag" style={{ backgroundImage: `url(https://flagcdn.com/w40/${f.cc}.png)` }} aria-hidden />
              {f.label}
            </Link>
          )
        })}
        {/* Pasaulis — tik ikona (visi lokalūs + bendri pasaulio topai). */}
        <Link href={worldOn ? '/topai' : '/topai/pasaulis'} prefetch={false}
          className={`flt-chip flt-chip--ico${worldOn ? ' on' : ''}`}
          aria-current={worldOn ? 'page' : undefined}
          aria-label="Pasaulis" title="Pasaulis">
          <WorldIcon />
        </Link>
      </div>
    </nav>
  )
}
