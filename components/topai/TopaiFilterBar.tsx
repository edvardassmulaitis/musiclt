// components/topai/TopaiFilterBar.tsx
//
// Topų hub'o filtrų eilutė — pakeitė senus route-tab'us (TopaiTabs).
// Du pill eilutės (Regionas / Tipas), kaip /muzika, /albumai, /dainos
// (mz-fbar pattern). Kiekvienas pill = TIKRAS <Link> → crawlable SEO
// path-segment puslapis (/topai/lietuva, /topai/dainos, ...). Filtrai
// vienmačiai: pasirinkus regioną nuresetinamas tipas ir atvirkščiai —
// taip išvengiam URL kombinacijų sprogimo, bet padengiam vertingus
// long-tail terminus.
//
// Self-contained CSS (<style>) — naudojama ir /topai hub'e, ir /top40,
// /top30 pilnų topų puslapiuose, kurie neturi hub'o styles bloko.

import Link from 'next/link'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

const REGIONS: { key: TopaiView; href: string; label: string }[] = [
  { key: 'all', href: '/topai', label: 'Visi' },
  { key: 'lt', href: '/topai/lietuva', label: '🇱🇹 Lietuva' },
  { key: 'world', href: '/topai/pasaulis', label: '🌍 Pasaulis' },
  { key: 'us', href: '/topai/jav', label: '🇺🇸 JAV' },
  { key: 'uk', href: '/topai/uk', label: '🇬🇧 UK' },
]
const TYPES: { key: TopaiView; href: string; label: string }[] = [
  { key: 'all', href: '/topai', label: 'Visi' },
  { key: 'songs', href: '/topai/dainos', label: 'Dainos' },
  { key: 'albums', href: '/topai/albumai', label: 'Albumai' },
  { key: 'community', href: '/topai/bendruomene', label: 'Music.lt' },
]

const REGION_KEYS: TopaiView[] = ['lt', 'world', 'us', 'uk']
const TYPE_KEYS: TopaiView[] = ['songs', 'albums', 'community']

export function TopaiFilterBar({ view }: { view: TopaiView }) {
  const isRegion = REGION_KEYS.includes(view)
  const isType = TYPE_KEYS.includes(view)

  // „Visi" aktyvus regionų eilutėje, kai nepasirinktas joks regionas.
  const regionActive = (k: TopaiView) => (k === 'all' ? !isRegion : view === k)
  // „Visi" aktyvus tipų eilutėje, kai nepasirinktas joks tipas.
  const typeActive = (k: TopaiView) => (k === 'all' ? !isType : view === k)

  return (
    <nav className="tpf" aria-label="Topų filtrai">
      <style>{tpfStyles}</style>
      <div className="tpf-row">
        <span className="tpf-lbl">Regionas</span>
        <div className="tpf-chips">
          {REGIONS.map((r) => (
            <Link key={r.key} href={r.href} prefetch={false}
              className={`tpf-chip${regionActive(r.key) ? ' on' : ''}`}
              aria-current={regionActive(r.key) ? 'page' : undefined}>
              {r.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="tpf-row">
        <span className="tpf-lbl">Tipas</span>
        <div className="tpf-chips">
          {TYPES.map((t) => (
            <Link key={t.key} href={t.href} prefetch={false}
              className={`tpf-chip${typeActive(t.key) ? ' on' : ''}`}
              aria-current={typeActive(t.key) ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

const tpfStyles = `
  .tpf { max-width: var(--page-max, 1280px); margin: 0 auto var(--page-head-gap, 18px); padding: 0 var(--page-pad-x, 20px); display: flex; flex-direction: column; gap: 9px; }
  .tpf-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .tpf-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint, var(--text-muted)); min-width: 62px; font-family: 'Outfit', sans-serif; }
  .tpf-chips { display: flex; flex-wrap: wrap; gap: 7px; }
  .tpf-chip { padding: 6px 14px; border-radius: 100px; font-size: 12.5px; font-weight: 600; background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); transition: color .15s, border-color .15s, background .15s; white-space: nowrap; font-family: 'Outfit', sans-serif; text-decoration: none; }
  .tpf-chip:hover { color: var(--text-primary); border-color: rgba(249,115,22,0.4); }
  .tpf-chip.on { background: var(--accent-orange); border-color: var(--accent-orange); color: #fff; }
  @media (max-width: 640px) {
    .tpf { padding: 0 var(--page-pad-x-sm, 14px); }
    .tpf-lbl { min-width: 100%; }
  }
`
