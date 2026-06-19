// components/muzika/MuzikaFilterBar.tsx
//
// PIRMA filtro eilutė — SEO-kritiška. Šalis (Visi/LT/Užsienio) ir Rikiavimas
// (Viskas/Dabar/Visų laikų) yra TIKRI <Link> elementai → crawlable, kiekvienas
// veda į atskirą path-segment SEO puslapį. Rikiavimo eilutė rodoma tik kai
// pasirinkta konkreti šalis (scope != 'all'), nes /muzika (visi) variantas
// neturi atskirų „dabar"/„visų laikų" URL'ų.
//
// Server component (be 'use client') — viskas statiška.

import Link from 'next/link'
import type { HubScope } from '@/lib/muzika-hub'

export type HubMode = 'both' | 'trending' | 'alltime'

/** scope+mode → kanoninis path-segment URL (7 variantai). */
export function hubHref(scope: HubScope, mode: HubMode): string {
  if (scope === 'all') return '/muzika'
  const base = scope === 'lt' ? '/muzika/lietuviska' : '/muzika/uzsienio'
  if (mode === 'trending') return `${base}/dabar`
  if (mode === 'alltime') return `${base}/populiariausia`
  return base
}

export type HubTipas = 'atlikejai' | 'dainos' | 'albumai'

/** Sudedamasis hub URL: path (scope+mode) + ?stilius&?tipas query.
 *  Leidžia filtrams SUSIDĖTI (užsienio + roko + dainos = vienas URL). */
export function hubUrl(
  scope: HubScope, mode: HubMode,
  opts: { stilius?: string | null; tipas?: HubTipas | null } = {},
): string {
  const path = hubHref(scope, mode)
  const qs = new URLSearchParams()
  if (opts.stilius) qs.set('stilius', opts.stilius)
  if (opts.tipas && opts.tipas !== 'atlikejai') qs.set('tipas', opts.tipas)
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

export function MuzikaFilterBar({ scope, mode }: { scope: HubScope; mode: HubMode }) {
  const scopes: { key: HubScope; label: string }[] = [
    { key: 'all', label: 'Visi' },
    { key: 'lt', label: '🇱🇹 Lietuviška' },
    { key: 'world', label: '🌍 Užsienio' },
  ]
  const modes: { key: HubMode; label: string }[] = [
    { key: 'both', label: 'Viskas' },
    { key: 'trending', label: 'Dabar populiaru' },
    { key: 'alltime', label: 'Visų laikų' },
  ]
  return (
    <div className="flt-bar flt-bar--wrap">
      <div className="flt-group">
        <span className="mz-flbl">Šalis</span>
        <div className="flt-group">
          {scopes.map((s) => (
            <Link
              key={s.key}
              href={hubHref(s.key, s.key === 'all' ? 'both' : mode)}
              className={`flt-chip${scope === s.key ? ' on' : ''}`}
              prefetch={false}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
      {scope !== 'all' && (
        <div className="flt-group">
          <span className="mz-flbl">Rikiuoti</span>
          <div className="flt-group">
            {modes.map((m) => (
              <Link
                key={m.key}
                href={hubHref(scope, m.key)}
                className={`flt-chip${mode === m.key ? ' on' : ''}`}
                prefetch={false}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
