// components/topai/TopaiFilterBar.tsx
//
// /topai filtrų juosta — pastatyta ant KANONINIO <FilterBar> (components/ui).
// Pirmas puslapis, perkeltas ant vieningo filtrų komponento (šablonas kitiems).
//
//   • Regionas = primary  → inline mobile + desktop (Visi / LT / JAV / UK / Pasaulis)
//   • Tipas    = secondary → desktop inline; MOBILE už „Daugiau" (Visi / Dainos /
//                            Albumai / Bendruomenė) — jokių dviejų eilučių mobile.
//
// Logika NEKEISTA: kiekvienas chip = TIKRAS <Link> į esamą path-segment SEO
// puslapį (/topai, /topai/lietuva, /topai/jav, /topai/uk, /topai/pasaulis,
// /topai/dainos, /topai/albumai, /topai/bendruomene). `view` modelis lieka
// vieno pasirinkimo (regionas XOR tipas) — todėl Region grupė rodo „Visi" kai
// aktyvus tipas, ir atvirkščiai.
//
// Server component (be 'use client') — perduoda tik serializuojamus duomenis
// klientiniam <FilterBar>.

import { FilterBar, type FilterGroup } from '@/components/ui/FilterBar'

export type TopaiView = 'all' | 'lt' | 'world' | 'us' | 'uk' | 'songs' | 'albums' | 'community'

export function TopaiFilterBar({ view }: { view: TopaiView }) {
  // view → aktyvus key kiekvienai ašiai (vieno pasirinkimo modelis)
  const region: string = (['lt', 'world', 'us', 'uk'] as TopaiView[]).includes(view) ? view : 'all'
  const tipas: string = (['songs', 'albums', 'community'] as TopaiView[]).includes(view) ? view : 'all'

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
        { key: 'all', label: 'Visi', href: '/topai' },
        { key: 'songs', label: 'Dainos', href: '/topai/dainos' },
        { key: 'albums', label: 'Albumai', href: '/topai/albumai' },
        { key: 'community', label: 'Bendruomenė', href: '/topai/bendruomene' },
      ],
    },
  ]

  return <FilterBar groups={groups} ariaLabel="Topų filtrai" />
}
