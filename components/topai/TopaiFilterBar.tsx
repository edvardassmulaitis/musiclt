'use client'
// components/topai/TopaiFilterBar.tsx
//
// /topai naršyklė — filtrų juosta (kanoninis <FilterBar>) + CLIENT-SIDE
// kortelių filtravimas BE reload'o. Visos kortelės renderinamos serveryje
// (vaikai), o čia tik rodom/slepiam pagal pasirinktą `view` (instant UX).
// URL atnaujinamas per history.replaceState (shareable, be navigacijos).
//
//   • Regionas = primary  → inline chip'ai (Visi / LT / JAV / UK / Pasaulis)
//   • Tipas    = secondary → kompaktiškas dropdown (Visi / Dainos / Albumai /
//                            Bendruomenė). Viena eilutė ir mobile, ir desktop.
//
// SEO: chip'ai = tikri <a href> į esamus path-segment puslapius
// (/topai/lietuva, /topai/dainos ...). Crawler'is mato; useris gauna instant.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FilterBar, type FilterGroup } from '@/components/ui/FilterBar'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

const REGIONS: TopaiView[] = ['lt', 'world', 'us', 'uk']
const TYPES: TopaiView[] = ['songs', 'albums', 'community']

const PATHS: Record<TopaiView, string> = {
  all: '/topai',
  lt: '/topai/lietuva',
  world: '/topai/pasaulis',
  us: '/topai/jav',
  uk: '/topai/uk',
  songs: '/topai/dainos',
  albums: '/topai/albumai',
  community: '/topai/bendruomene',
}

export function TopaiBrowser({ initialView, children }: { initialView: TopaiView; children: ReactNode }) {
  const [view, setView] = useState<TopaiView>(initialView)
  const [empty, setEmpty] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // Kortelių rodymas/slėpimas pagal view (be navigacijos).
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const isRegion = REGIONS.includes(view)
    const isType = TYPES.includes(view)
    let shown = 0
    grid.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      const ok = isRegion ? el.dataset.region === view : isType ? el.dataset.ctype === view : true
      el.style.display = ok ? '' : 'none'
      if (ok) shown++
    })
    setEmpty(shown === 0)
  }, [view])

  const region = REGIONS.includes(view) ? view : 'all'
  const tipas = TYPES.includes(view) ? view : 'all'

  const groups: FilterGroup[] = [
    {
      id: 'regionas',
      label: 'Regionas',
      tier: 'primary',
      active: region,
      options: [
        { key: 'all', label: 'Visi', href: '/topai' },
        { key: 'lt', label: 'LT', href: '/topai/lietuva', flagCc: 'lt' },
        { key: 'us', label: 'JAV', href: '/topai/jav', flagCc: 'us' },
        { key: 'uk', label: 'UK', href: '/topai/uk', flagCc: 'gb' },
        { key: 'world', label: 'Pasaulis', href: '/topai/pasaulis', world: true },
      ],
    },
    {
      id: 'tipas',
      label: 'Tipas',
      tier: 'secondary',
      active: tipas,
      options: [
        { key: 'all', label: 'Visi tipai', href: '/topai' },
        { key: 'songs', label: 'Dainos', href: '/topai/dainos' },
        { key: 'albums', label: 'Albumai', href: '/topai/albumai' },
        { key: 'community', label: 'Bendruomenė', href: '/topai/bendruomene' },
      ],
    },
  ]

  function onSelect(_groupId: string, key: string) {
    const v: TopaiView = key === 'all' ? 'all' : (key as TopaiView)
    setView(v)
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', PATHS[v] || '/topai')
    }
  }

  return (
    <>
      <FilterBar groups={groups} ariaLabel="Topų filtrai" onSelect={onSelect} />
      <div className="tp-grid" ref={gridRef}>{children}</div>
      {empty && <div className="tp-none">Šios kategorijos topai šiuo metu formuojasi.</div>}
    </>
  )
}
