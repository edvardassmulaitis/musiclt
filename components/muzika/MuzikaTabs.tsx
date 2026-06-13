'use client'
// components/muzika/MuzikaTabs.tsx
//
// ANTRA filtro eilutė + turinio perjungimas. Stilius/Šalis dropdown'ai =
// klientinė navigacija į esamus landing'us (/muzikos-stilius, /atlikejai) —
// crawlable atitikmenys yra GenreCards + SEO footer'yje. Tipas (Atlikėjai/
// Dainos/Albumai) = tab'ai.
//
// SVARBU: artists/tracks/albums ateina kaip SERVER-rendered ReactNode props —
// visas turinys lieka HTML'e (crawlable), JS tik perjungia matomumą per
// `hidden`. Taip muzika-ui + muzika-hub (admin Supabase) NEPATENKA į kliento
// bundle'ą.

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'

type TabKey = 'atlikejai' | 'dainos' | 'albumai'
type Opt = { label: string; href: string }

export default function MuzikaTabs({
  artists, tracks, albums, styleOptions, countryOptions,
}: {
  artists: ReactNode
  tracks: ReactNode
  albums: ReactNode
  styleOptions: Opt[]
  countryOptions: Opt[]
}) {
  const [tab, setTab] = useState<TabKey>('atlikejai')
  const router = useRouter()

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'atlikejai', label: 'Atlikėjai' },
    { key: 'dainos', label: 'Dainos' },
    { key: 'albumai', label: 'Albumai' },
  ]

  return (
    <>
      <div className="mz-hubrow mz-hubrow2">
        <div className="mz-fdrops">
          <select
            className="mz-fsel"
            defaultValue=""
            onChange={(e) => { if (e.target.value) router.push(e.target.value) }}
            aria-label="Filtruoti pagal stilių"
          >
            <option value="">Visi stiliai</option>
            {styleOptions.map((o) => <option key={o.href} value={o.href}>{o.label}</option>)}
          </select>
          {countryOptions.length > 0 && (
            <select
              className="mz-fsel"
              defaultValue=""
              onChange={(e) => { if (e.target.value) router.push(e.target.value) }}
              aria-label="Filtruoti pagal šalį"
            >
              <option value="">Visos šalys</option>
              {countryOptions.map((o) => <option key={o.href} value={o.href}>{o.label}</option>)}
            </select>
          )}
        </div>
        <div className="mz-ftabs" role="tablist" aria-label="Turinio tipas">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`mz-ftab${tab === t.key ? ' on' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div hidden={tab !== 'atlikejai'}>{artists}</div>
      <div hidden={tab !== 'dainos'}>{tracks}</div>
      <div hidden={tab !== 'albumai'}>{albums}</div>
    </>
  )
}
