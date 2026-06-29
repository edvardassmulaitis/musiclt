'use client'
// components/ui/FilterBar.tsx
//
// KANONINĖ filtrų juosta. Vienas komponentas visiems naršymo puslapiams.
//
// Grupės tipai (`tier`):
//   • 'primary'   → inline pill chip'ai (mobile + desktop). Mobile = horizontalus
//                   scroll su scroll-snap + mask-image edge-fade.
//   • 'secondary' → DESKTOP: inline chip'ai (išskleisti, be label'io).
//                   MOBILE: tik IKONA, atidaranti popover'ą (vietos taupymas,
//                   kad viskas tilptų vienoje eilutėje). Popover'as visada DOM'e
//                   (display:none kol uždarytas) → <a href> lieka crawlable (SEO).
//
// Be label'ių (Edvardo: „Regionas" obvious). Be „|" mobile.
//
// Du režimai: su `onSelect` → CLIENT (be reload'o, <a> + preventDefault);
// be `onSelect` → tikra navigacija per <Link prefetch>.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

export type FilterOption = {
  key: string
  label: string
  href: string
  flagCc?: string
  world?: boolean
}

export type FilterGroup = {
  id: string
  label: string
  active: string
  options: FilterOption[]
  tier?: 'primary' | 'secondary'
}

type SelectFn = (groupId: string, key: string) => void

function Flag({ cc }: { cc: string }) {
  return <span className="fb-flag" style={{ backgroundImage: `url(https://flagcdn.com/w40/${cc}.png)` }} aria-hidden />
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

function OptionEl({ o, on, groupId, cls, onSelect, afterSelect }: {
  o: FilterOption; on: boolean; groupId: string; cls: string
  onSelect?: SelectFn; afterSelect?: () => void
}) {
  const inner = (
    <>
      {o.flagCc && <Flag cc={o.flagCc} />}
      {o.world && <Globe />}
      <span>{o.label}</span>
    </>
  )
  const className = `${cls}${on ? ' on' : ''}${o.world ? ' fb-chip-ico' : ''}`
  if (onSelect) {
    return (
      <a
        href={o.href}
        className={className}
        aria-current={on ? 'page' : undefined}
        data-noprogress
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          onSelect(groupId, o.key)
          afterSelect?.()
        }}
      >
        {inner}
      </a>
    )
  }
  return (
    <Link href={o.href} className={className} aria-current={on ? 'page' : undefined}>
      {inner}
    </Link>
  )
}

function ChipGroup({ g, onSelect }: { g: FilterGroup; onSelect?: SelectFn }) {
  return (
    <div className="fb-grp">
      {g.options.map((o) => (
        <OptionEl key={o.key} o={o} on={o.key === g.active} groupId={g.id} cls="fb-chip" onSelect={onSelect} />
      ))}
    </div>
  )
}

// Mobile-only: tik ikona, atidaro popover'ą su opcijomis.
function IconDropdown({ g, open, setOpen, onSelect }: {
  g: FilterGroup; open: boolean; setOpen: (v: boolean) => void; onSelect?: SelectFn
}) {
  const activeOpt = g.options.find((o) => o.key === g.active)
  return (
    <div className="fb-dd fb-sec-dd">
      <button
        type="button"
        className={`fb-icon-btn${activeOpt ? ' on' : ''}`}
        aria-label={g.label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      <div className={`fb-pop${open ? ' open' : ''}`} role="menu">
        {g.options.map((o) => (
          <OptionEl
            key={o.key}
            o={o}
            on={o.key === g.active}
            groupId={g.id}
            cls="fb-opt"
            onSelect={onSelect}
            afterSelect={() => setOpen(false)}
          />
        ))}
      </div>
    </div>
  )
}

export function FilterBar({ groups, ariaLabel, onSelect }: {
  groups: FilterGroup[]
  ariaLabel?: string
  onSelect?: SelectFn
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!openId) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.fb-dd')) setOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openId])

  const primary = groups.filter((g) => (g.tier ?? 'primary') === 'primary')
  const secondary = groups.filter((g) => g.tier === 'secondary')

  return (
    <nav className="fb" aria-label={ariaLabel || 'Filtrai'}>
      <style>{fbStyles}</style>
      <div className="fb-bar">
        <div className="fb-primary">
          {primary.map((g) => <ChipGroup key={g.id} g={g} onSelect={onSelect} />)}
        </div>

        {secondary.length > 0 && (
          <>
            <span className="fb-divider" aria-hidden />
            {/* Desktop: išskleisti inline chip'ai */}
            <div className="fb-sec-inline">
              {secondary.map((g) => <ChipGroup key={g.id} g={g} onSelect={onSelect} />)}
            </div>
            {/* Mobile: tik ikona */}
            {secondary.map((g) => (
              <IconDropdown
                key={g.id}
                g={g}
                open={openId === g.id}
                setOpen={(v) => setOpenId(v ? g.id : null)}
                onSelect={onSelect}
              />
            ))}
          </>
        )}
      </div>
    </nav>
  )
}

const fbStyles = `
  .fb { max-width: var(--page-max, 1280px); margin: 0 auto var(--page-head-gap, 22px); padding: 0 var(--page-pad-x, 24px); font-family: 'Outfit', sans-serif; }
  .fb-bar { display: flex; align-items: center; gap: 10px; }
  .fb-primary { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .fb-grp { display: flex; align-items: center; gap: 8px; }
  .fb-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; border-radius: var(--radius-pill, 999px); font-size: var(--fs-sm, 13px); font-weight: 600; line-height: 1; text-decoration: none; white-space: nowrap; background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); transition: color .15s, border-color .15s, background .15s; cursor: pointer; }
  .fb-chip:hover { color: var(--text-primary); border-color: var(--accent-orange); }
  .fb-chip.on { background: var(--accent-orange); border-color: var(--accent-orange); color: #fff; }
  .fb-chip-ico { padding: 6px 12px; }
  .fb-chip svg { display: block; }
  .fb-flag { width: 20px; height: 14px; flex-shrink: 0; border-radius: 3px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px rgba(0,0,0,0.08); }
  .fb-divider { width: 1px; height: 22px; background: var(--border-default, rgba(0,0,0,0.1)); flex: 0 0 auto; margin: 0 4px; }
  .fb-sec-inline { display: flex; align-items: center; gap: 8px; }
  .fb-dd { position: relative; flex: 0 0 auto; }
  .fb-sec-dd { display: none; }
  .fb-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border-radius: var(--radius-pill, 999px); background: var(--bg-hover, var(--bg-surface)); border: 1px solid var(--border-default, var(--border-subtle)); color: var(--text-secondary); cursor: pointer; }
  .fb-icon-btn svg { display: block; }
  .fb-icon-btn:hover { color: var(--text-primary); border-color: var(--accent-orange); }
  .fb-icon-btn.on, .fb-icon-btn[aria-expanded="true"] { color: var(--accent-orange); border-color: var(--accent-orange); }
  .fb-pop { position: absolute; top: calc(100% + 8px); right: 0; z-index: 50; min-width: 180px; display: none; flex-direction: column; gap: 2px; padding: 7px; background: var(--bg-surface, var(--bg-elevated)); border: 1px solid var(--border-default, rgba(0,0,0,0.1)); border-radius: 14px; box-shadow: 0 14px 40px rgba(0,0,0,0.18); }
  .fb-pop.open { display: flex; }
  .fb-opt { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border-radius: 9px; font-size: var(--fs-sm, 13px); font-weight: 600; font-family: 'Outfit', sans-serif; text-decoration: none; white-space: nowrap; background: transparent; border: 1px solid transparent; color: var(--text-secondary); cursor: pointer; }
  .fb-opt:hover { background: var(--bg-hover); color: var(--text-primary); }
  .fb-opt.on { color: var(--accent-orange); }

  @media (max-width: 680px) {
    .fb { padding: 0 var(--page-pad-x-sm, 16px); }
    .fb-primary { flex: 1 1 auto; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x mandatory; -webkit-mask-image: linear-gradient(90deg, #000 90%, transparent); mask-image: linear-gradient(90deg, #000 90%, transparent); padding-right: 4px; }
    .fb-primary::-webkit-scrollbar { display: none; }
    .fb-primary .fb-chip { scroll-snap-align: start; flex: 0 0 auto; }
    .fb-divider { display: none; }
    .fb-sec-inline { display: none; }
    .fb-sec-dd { display: inline-flex; }
  }
`
