'use client'
// components/topai/TopaiFilterBar.tsx
//
// /topai naršyklė — filtrų juosta (kanoninis <FilterBar>) + CLIENT-SIDE
// kortelių filtravimas BE reload'o. Visos kortelės renderinamos serveryje
// (vaikai), o čia tik rodom/slepiam pagal pasirinktą `view` (instant UX).
//
// TOGGLE koncepcija (Edvardo): NĖRA „Visi" — pradinė būsena = niekas
// nepažymėta = viskas. Paspaudus aktyvų chip'ą → grįžtam į pradinę. „Pasaulis"
// = viskas, tad atskiro chip'o nėra (default jau rodo pasaulio topus).
//
//   • Regionas = primary  → inline chip'ai: LT / JAV / UK
//   • Tipas    = secondary → dropdown: Dainos / Albumai / Music.lt topai
//
// SEO: chip'ai = tikri <a href> į esamus path-segment puslapius. /topai/pasaulis
// route lieka (SEO/tiesioginė prieiga), tik chip'o juostoje nebėra.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FilterBar, type FilterGroup } from '@/components/ui/FilterBar'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

// Kortelių matomumo filtrui (world įeina — pasiekiama per /topai/pasaulis route).
const REGION_VIEWS: TopaiView[] = ['lt', 'world', 'us', 'uk']
const TYPE_VIEWS: TopaiView[] = ['songs', 'albums', 'community']
// Matomi region chip'ai (be world/all — toggle koncepcija).
const REGION_CHIPS: TopaiView[] = ['lt', 'us', 'uk']

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
    const isRegion = REGION_VIEWS.includes(view)
    const isType = TYPE_VIEWS.includes(view)
    let shown = 0
    grid.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      const ok = isRegion ? el.dataset.region === view : isType ? el.dataset.ctype === view : true
      el.style.display = ok ? '' : 'none'
      if (ok) shown++
    })
    setEmpty(shown === 0)
  }, [view])

  // Toggle: active='' kai nieko nepažymėta.
  const regionActive: string = REGION_CHIPS.includes(view) ? view : ''
  const tipasActive: string = TYPE_VIEWS.includes(view) ? view : ''

  const groups: FilterGroup[] = [
    {
      id: 'regionas',
      label: 'Regionas',
      tier: 'primary',
      active: regionActive,
      options: [
        { key: 'lt', label: 'LT', href: '/topai/lietuva', flagCc: 'lt' },
        { key: 'us', label: 'JAV', href: '/topai/jav', flagCc: 'us' },
        { key: 'uk', label: 'UK', href: '/topai/uk', flagCc: 'gb' },
      ],
    },
    {
      id: 'tipas',
      label: 'Tipas',
      tier: 'secondary',
      active: tipasActive,
      options: [
        { key: 'songs', label: 'Dainos', href: '/topai/dainos' },
        { key: 'albums', label: 'Albumai', href: '/topai/albumai' },
        { key: 'community', label: 'Music.lt topai', href: '/topai/bendruomene' },
      ],
    },
  ]

  function onSelect(groupId: string, key: string) {
    const cur = groupId === 'regionas' ? regionActive : tipasActive
    const v: TopaiView = cur === key ? 'all' : (key as TopaiView) // toggle off → viskas
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
