'use client'
// components/ui/FilterBar.tsx
//
// KANONINĖ filtrų juosta (pill stilius). Vienas komponentas visiems naršymo
// puslapiams — kad filtrai nustotų dreifuoti tarp puslapių.
//
// Modelis:
//   • Kiekvienas filtras = grupė (`FilterGroup`) su pasirinkimais (`FilterOption`).
//   • Pasirinkimas = TIKRAS <Link> (path-segment ARBA ?query) → crawlable (SEO).
//   • Grupė turi `tier`: 'primary' (matoma inline mobile + desktop) arba
//     'secondary' (desktop inline; MOBILE paslepiama už „Daugiau" — JOKIŲ
//     dviejų eilučių, viena švari primary eilutė).
//
// Responsive kontraktas:
//   • Mobile primary eilutė = horizontalus scroll su scroll-snap + mask-image
//     edge-fade (užuomina, kad galima slinkti).
//   • Mobile secondary = „Daugiau" mygtukas atidaro panelę PO juosta
//     (visi <Link> lieka DOM'e → SEO nenukenčia, tik display:none kol uždaryta).
//   • Desktop = viskas inline; „Daugiau" mygtukas paslėptas.
//
// Spalvos/dydžiai TIK per globalius tokenus (--accent-orange, --radius-pill,
// --fs-*, --bg-*, --border-*, --text-*). Jokio hardcode.

import Link from 'next/link'
import { useState } from 'react'

export type FilterOption = {
  key: string                 // unikalus key grupėje (sutampa su grupės `active`, kai pažymėta)
  label: string
  href: string                // path-segment arba ?query URL
  flagCc?: string             // flagcdn dviraidis kodas (pvz. 'lt', 'us', 'gb')
  world?: boolean             // rodyti gaublio ikoną (vietoj vėliavos)
}

export type FilterGroup = {
  id: string
  label: string
  active: string              // aktyvios opcijos `key` (numatytoji = options[0].key)
  options: FilterOption[]
  tier?: 'primary' | 'secondary'   // numatyta 'primary'
}

function Flag({ cc }: { cc: string }) {
  return (
    <span
      className="fb-flag"
      style={{ backgroundImage: `url(https://flagcdn.com/w40/${cc}.png)` }}
      aria-hidden
    />
  )
}

function Globe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
    </svg>
  )
}

function Group({ g }: { g: FilterGroup }) {
  return (
    <div className="fb-grp">
      <span className="fb-lbl">{g.label}</span>
      {g.options.map((o) => {
        const on = o.key === g.active
        return (
          <Link
            key={o.key}
            href={o.href}
            prefetch={false}
            className={`fb-chip${on ? ' on' : ''}${o.world ? ' fb-chip-ico' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            {o.flagCc && <Flag cc={o.flagCc} />}
            {o.world && <Globe />}
            <span>{o.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

export function FilterBar({ groups, ariaLabel }: { groups: FilterGroup[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false)

  const primary = groups.filter((g) => (g.tier ?? 'primary') === 'primary')
  const secondary = groups.filter((g) => g.tier === 'secondary')
  const hasSec = secondary.length > 0
  // Ar kuri nors secondary grupė turi NE numatytąją (ne pirmą) reikšmę →
  // taškas ant „Daugiau", kad vartotojas matytų: yra paslėptas aktyvus filtras.
  const secActive = secondary.some((g) => g.active !== g.options[0]?.key)

  return (
    <nav className={`fb${open ? ' fb-open' : ''}`} aria-label={ariaLabel || 'Filtrai'}>
      <style>{fbStyles}</style>
      <div className="fb-bar">
        <div className="fb-primary">
          {primary.map((g) => <Group key={g.id} g={g} />)}
        </div>

        {hasSec && (
          <>
            <span className="fb-divider" aria-hidden />
            <div className="fb-sec">
              {secondary.map((g) => <Group key={g.id} g={g} />)}
            </div>
            <button
              type="button"
              className={`fb-more${secActive ? ' fb-more-has' : ''}`}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3 6h18M6 12h12M10 18h4" />
              </svg>
              <span>Daugiau</span>
              {secActive && <span className="fb-dot" aria-hidden />}
            </button>
          </>
        )}
      </div>
    </nav>
  )
}

const fbStyles = `
  .fb { max-width: var(--page-max, 1280px); margin: 0 auto var(--page-head-gap, 22px); padding: 0 var(--page-pad-x, 24px); font-family: 'Outfit', sans-serif; }
  .fb-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .fb-primary { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .fb-grp { display: flex; align-items: center; gap: 8px; }
  .fb-grp + .fb-grp { margin-left: 6px; }
  .fb-lbl { font-size: var(--fs-xs, 11.5px); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint, var(--text-muted)); white-space: nowrap; }
  .fb-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: var(--radius-pill, 999px); font-size: var(--fs-sm, 13px); font-weight: 600; line-height: 1; text-decoration: none; white-space: nowrap; background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); transition: color .15s, border-color .15s, background .15s; }
  .fb-chip:hover { color: var(--text-primary); border-color: var(--accent-orange); }
  .fb-chip.on { background: var(--accent-orange); border-color: var(--accent-orange); color: #fff; }
  .fb-chip-ico { padding: 6px 12px; }
  .fb-chip svg { display: block; }
  .fb-flag { width: 20px; height: 14px; flex-shrink: 0; border-radius: 3px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px rgba(0,0,0,0.08); }
  .fb-divider { width: 1px; height: 22px; background: var(--border-default, rgba(0,0,0,0.1)); }
  .fb-sec { display: flex; align-items: center; gap: 8px; }
  .fb-more { display: none; }
  .fb-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-orange); }

  @media (max-width: 680px) {
    .fb { padding: 0 var(--page-pad-x-sm, 16px); }
    .fb-bar { gap: 10px; }
    .fb-primary { flex: 1 1 auto; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x mandatory; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); padding-right: 6px; }
    .fb-primary::-webkit-scrollbar { display: none; }
    .fb-primary .fb-chip { scroll-snap-align: start; flex: 0 0 auto; }
    .fb-primary .fb-lbl { display: none; }
    .fb-divider { display: none; }
    .fb-more { display: inline-flex; align-items: center; gap: 6px; order: 1; flex: 0 0 auto; position: relative; padding: 6px 13px; border-radius: var(--radius-pill, 999px); font-size: var(--fs-sm, 13px); font-weight: 600; font-family: 'Outfit', sans-serif; background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); cursor: pointer; }
    .fb-more svg { display: block; }
    .fb-more .fb-dot { position: absolute; top: 3px; right: 5px; }
    .fb-open .fb-more { border-color: var(--accent-orange); color: var(--text-primary); }
    .fb-sec { order: 2; flex-basis: 100%; display: none; flex-wrap: wrap; gap: 9px 8px; padding-top: 4px; }
    .fb-sec .fb-grp { flex-wrap: wrap; gap: 8px; }
    .fb-sec .fb-lbl { display: block; flex-basis: 100%; margin-bottom: 2px; }
    .fb-open .fb-sec { display: flex; }
  }
`
