'use client'
// components/muzika/MuzikaTabs.tsx
//
// SUDEDAMA filtrų juosta /muzika hub'ui. Visi filtrai SUSIDEDA per URL:
//   Šalis (scope) = path segmentas (/muzika/uzsienio) — SEO Link'ai
//   Rikiavimas (mode) = path segmentas (tik konkrečiai šaliai)
//   Stilius = ?stilius= (popover su žanrais; išlaiko scope+tipas)
//   Tipas (Atlikėjai/Dainos/Albumai) = ?tipas= (išlaiko scope+stilius)
// Pvz. „Užsienio + Roko + Dainos" = /muzika/uzsienio?stilius=roko-muzika&tipas=dainos.
// Rezultatą server-render'ina puslapis pagal šiuos parametrus — juosta tik
// kuria teisingus <Link> URL'us (viskas crawlable + dalinamasi).

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { HubScope } from '@/lib/muzika-hub'
import { hubUrl, type HubMode, type HubTipas } from './MuzikaFilterBar'

type GenreOpt = { slug: string; label: string }

const Icon = {
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>,
  note: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>,
}

export default function MuzikaTabs({
  scope, mode, tipas, genreSlug, genreLabel, genreOptions,
}: {
  scope: HubScope
  mode: HubMode
  tipas: HubTipas
  genreSlug: string | null
  genreLabel: string | null
  genreOptions: GenreOpt[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc) }
  }, [open])

  // Perjungiant šalį išlaikom rikiavimą (jei buvom konkrečioj šaly).
  const keepMode: HubMode = scope === 'all' ? 'both' : mode
  // Be „Visi" — nieko nepasirinkus rodoma viskas (/muzika). Aktyvų paspaudus → grįžta į „viską".
  const scopes: { key: Exclude<HubScope, 'all'>; label: string }[] = [
    { key: 'lt', label: '🇱🇹 Lietuviška' },
    { key: 'world', label: '🌍 Užsienio' },
  ]
  // Be „Viskas" — numatyta abu (both). Aktyvų rikiavimą paspaudus → grįžta į „abu".
  const modes: { key: Exclude<HubMode, 'both'>; label: string }[] = [
    { key: 'trending', label: 'Dabar' },
    { key: 'alltime', label: 'Visų laikų' },
  ]
  const tabs: { key: HubTipas; label: string }[] = [
    { key: 'atlikejai', label: 'Atlikėjai' },
    { key: 'dainos', label: 'Dainos' },
    { key: 'albumai', label: 'Albumai' },
  ]

  return (
    <div className="flt-bar flt-bar--wrap" style={{ marginTop: 14 }}>
      {/* Šalis — SEO Link chip'ai (išlaiko stilių + tipą) */}
      {scopes.map((s) => (
        <Link
          key={s.key}
          href={scope === s.key ? hubUrl('all', 'both', { stilius: genreSlug, tipas }) : hubUrl(s.key, keepMode, { stilius: genreSlug, tipas })}
          className={`flt-chip${scope === s.key ? ' on' : ''}`}
          aria-current={scope === s.key ? 'page' : undefined}
          prefetch={false}
        >
          {s.label}
        </Link>
      ))}

      {/* Rikiavimas — tik konkrečiai šaliai */}
      {scope !== 'all' && (
        <>
          <span className="flt-divider" />
          {modes.map((m) => (
            <Link
              key={m.key}
              href={mode === m.key ? hubUrl(scope, 'both', { stilius: genreSlug, tipas }) : hubUrl(scope, m.key, { stilius: genreSlug, tipas })}
              className={`flt-chip${mode === m.key ? ' on' : ''}`}
              prefetch={false}
            >
              {m.label}
            </Link>
          ))}
        </>
      )}

      <span className="flt-divider" />

      {/* Stilius — popover, sets ?stilius (išlaiko scope+tipas) */}
      <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" onClick={() => setOpen((v) => !v)} className={`flt-trig${genreSlug ? ' active' : ''}`}>
          {Icon.note}<span>{genreLabel || 'Stilius'}</span><span style={{ opacity: 0.7 }}>{Icon.chevron}</span>
        </button>
        {open && (
          <div className="mz-pop" style={{ width: 230 }}>
            <div className="mz-pop-list">
              {genreSlug && (
                <Link href={hubUrl(scope, keepMode, { stilius: null, tipas })} className="mz-opt" onClick={() => setOpen(false)} prefetch={false} style={{ fontWeight: 600 }}>
                  ✕ Visi stiliai
                </Link>
              )}
              {genreOptions.map((o) => (
                <Link
                  key={o.slug}
                  href={hubUrl(scope, keepMode, { stilius: o.slug, tipas })}
                  className={`mz-opt${o.slug === genreSlug ? ' on' : ''}`}
                  onClick={() => setOpen(false)}
                  prefetch={false}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tipas — sets ?tipas (išlaiko scope+stilius) */}
      <span className="mz-hubfbar-spacer" />
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={hubUrl(scope, keepMode, { stilius: genreSlug, tipas: t.key })}
          className={`flt-chip${tipas === t.key ? ' on' : ''}`}
          aria-current={tipas === t.key ? 'page' : undefined}
          prefetch={false}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
