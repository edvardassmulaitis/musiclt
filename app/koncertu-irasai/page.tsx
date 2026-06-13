// app/koncertu-irasai/page.tsx
//
// „Koncertų įrašai" — live pasirodymų vaizdo įrašų archyvas. SERVER-RENDERED
// (SEO) + client filtras/modalas (KoncertuIrasaiClient). Duomenys: lib/
// concert-recordings.ts. Stilius filtrui imamas iš atlikėjo žanrų (denorm.).

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/artist-browse'
import { getLatestRecordings, getRecordingStyles, recordingHref } from '@/lib/concert-recordings'
import KoncertuIrasaiClient from './KoncertuIrasaiClient'

// ISR — atsinaujina pridėjus naujų įrašų; perskaičiuojam kas 15 min.
export const revalidate = 900

const TITLE = 'Koncertų įrašai — live pasirodymų vaizdo įrašai | music.lt'
const DESCRIPTION =
  'Live pasirodymų vaizdo įrašai iš Lietuvos ir užsienio scenos — pilni koncertai, ' +
  'gyvi pasirodymai ir live sesijos. Žiūrėk ir filtruok pagal stilių bei atlikėją.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['koncertų įrašai', 'live pasirodymai', 'koncertai video', 'gyvi pasirodymai',
    'lietuviški koncertai', 'live sesijos', 'koncertų archyvas'],
  alternates: { canonical: `${SITE_URL}/koncertu-irasai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/koncertu-irasai`, type: 'website' },
}

export default async function KoncertuIrasaiPage() {
  const [recordings, styles] = await Promise.all([
    getLatestRecordings(150),
    getRecordingStyles(),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Koncertų įrašai — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/koncertu-irasai`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Koncertų įrašai',
      itemListElement: recordings.slice(0, 20).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${recordingHref(r)}`,
        name: r.title,
      })),
    },
  }

  return (
    <div className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="page-head">
        <h1>Koncertų įrašai</h1>
        <p>{DESCRIPTION}</p>
      </header>

      {recordings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] p-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">Įrašų archyvas dar pildomas</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-muted)]">
            Netrukus čia rasi pilnus koncertus, gyvus pasirodymus ir live sesijas iš Lietuvos scenos.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/koncertai" className="rounded-full bg-[var(--accent-orange)] px-4 py-2 text-sm font-bold text-white">Koncertai Lietuvoje</Link>
            <Link href="/atlikejai" className="rounded-full border border-[var(--border-default)] px-4 py-2 text-sm font-bold text-[var(--text-primary)]">Atlikėjai</Link>
          </div>
        </div>
      ) : (
        <KoncertuIrasaiClient recordings={recordings} styles={styles} />
      )}
    </div>
  )
}
