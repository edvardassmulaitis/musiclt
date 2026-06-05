// app/muzikos-atradimai/page.tsx
//
// „Muzikos atradimai" — forumo gija „Šviežiausi jūsų muzikiniai atradimai"
// paversta filtruojamu, naršomu feed'u. Server-rendered (SEO) + klientinis
// filtravimas (stilius / narys / metai / paieška). Duomenys: lib/discoveries.ts.
//
// Pradinė imtis — viena gija (tema 128402). Ateityje feed apjungs daugiau gijų.

import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/artist-browse'
import { getDiscoveries, buildFacets } from '@/lib/discoveries'
import DiscoveriesClient from './discoveries-client'

// ISR — atsinaujina importuojant naujus atradimus.
export const revalidate = 600

const TITLE = 'Muzikos atradimai — ką atrado bendruomenė | music.lt'
const DESCRIPTION =
  'Muzikos atradimai: bendruomenės narių atrastos grupės, dainos ir albumai — ' +
  'nuo užmirštų klasikų iki naujų vardų. Filtruok pagal stilių, narį ar laikotarpį.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['muzikos atradimai', 'naujos grupės', 'muzikos rekomendacijos',
    'ką paklausyti', 'nauja muzika', 'muzikos perlai', 'pamiršti atlikėjai'],
  alternates: { canonical: `${SITE_URL}/muzikos-atradimai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/muzikos-atradimai`, type: 'website' },
}

export default async function MuzikosAtradimaiPage() {
  const items = await getDiscoveries()
  const facets = buildFacets(items)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Muzikos atradimai — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/muzikos-atradimai`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Bendruomenės muzikos atradimai',
      numberOfItems: items.length,
      itemListElement: items.slice(0, 20).map((d, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: d.artist_name || d.track_name || 'Atradimas',
      })),
    },
  }

  return (
    <div className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="page-head">
        <h1>Muzikos atradimai</h1>
        <p>
          Bendruomenės narių atrastos grupės, dainos ir albumai — nuo užmirštų klasikų iki naujų
          vardų. Forumo gija paversta naršomu srautu: paspausk ▶, kad pasiklausytum, ir atrask.
        </p>
      </header>

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Atradimų dar nėra.</p>
      ) : (
        <DiscoveriesClient items={items} facets={facets} />
      )}
    </div>
  )
}
