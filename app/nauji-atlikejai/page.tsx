// app/nauji-atlikejai/page.tsx
//
// „Naujos muzikos radaras" — naujų ir mažai žinomų Lietuvos atlikėjų showcase.
// SERVER-RENDERED su tikrais <a> link'ais (SEO). Canonical slug /nauji-atlikejai
// (taiko head-query „nauji atlikėjai"); prekės ženklas / H1 — „Naujos muzikos
// radaras". Duomenys: lib/radaras.ts (hibridas — auto signalai + admin override).
//
// Sekcijos: hero (radaro skenavimas + statistika) → Spotlight (admin featured)
// → Nauji ir kylantys (auto tinklelis su „Naujas" ženkliukais) → Šviežios dainos
// → Naršyk pagal stilių → kūrėjo CTA → SEO proza + JSON-LD.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_URL } from '@/lib/artist-browse'
import {
  getFeaturedArtists, getEmergingArtists, getFreshTracks, getRadarStats,
} from '@/lib/radaras'
import { getGenreCounts } from '@/lib/muzika-hub'
import {
  radarStyles, RadarSweep, RadarSection, FeaturedRow, EmergingGrid,
  FreshTrackList, StyleChips,
} from '@/components/radaras-ui'

// ISR — radaras atsinaujina su naujais įkėlimais; perskaičiuojam kas 30 min.
export const revalidate = 1800

const TITLE = 'Nauji atlikėjai — naujos muzikos radaras | music.lt'
const DESCRIPTION =
  'Naujos muzikos radaras: nauji ir mažai žinomi Lietuvos atlikėjai bei grupės, ' +
  'šviežiausios dainos ir kylantys kūrėjai. Atrask, ką verta išgirsti pirmas.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['nauji atlikėjai', 'nauja lietuviška muzika', 'kylantys atlikėjai',
    'naujos grupės', 'nauja muzika', 'lietuviški atlikėjai', 'emerging artists Lietuva'],
  alternates: { canonical: `${SITE_URL}/nauji-atlikejai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/nauji-atlikejai`, type: 'website' },
}

export default async function NaujiAtlikejaiPage() {
  const [featured, emerging, freshTracks, stats, genres] = await Promise.all([
    getFeaturedArtists(),
    getEmergingArtists(30),
    getFreshTracks(12),
    getRadarStats(),
    getGenreCounts(),
  ])

  const topStyles = [...genres].sort((a, b) => b.n - a.n).slice(0, 12)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Naujos muzikos radaras — music.lt',
    description: DESCRIPTION,
    url: `${SITE_URL}/nauji-atlikejai`,
    isPartOf: { '@type': 'WebSite', name: 'music.lt', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Nauji ir kylantys atlikėjai',
      itemListElement: [...featured, ...emerging].slice(0, 20).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/atlikejai/${a.slug}`,
        name: a.name,
      })),
    },
  }

  return (
    <div className="rd">
      <style>{radarStyles}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Hero ── */}
      <header className="rd-hero">
        <div className="rd-hero-inner">
          <div className="rd-hero-txt">
            <span className="rd-hero-tag"><span className="rd-pulse" aria-hidden /> Naujos muzikos radaras</span>
            <h1>Nauji atlikėjai</h1>
            <p className="rd-hero-lead">
              Nauji ir mažai žinomi Lietuvos atlikėjai bei grupės, šviežiausios dainos ir
              kylantys kūrėjai — vieta atrasti tai, ką verta išgirsti pirmas.
            </p>
            <div className="rd-stats">
              {stats.emerging > 0 && (
                <span className="rd-stat"><b>{stats.emerging}</b><span>kylančių atlikėjų</span></span>
              )}
              {stats.freshTracks > 0 && (
                <span className="rd-stat"><b>{stats.freshTracks.toLocaleString('lt-LT')}</b><span>šviežių dainų per metus</span></span>
              )}
            </div>
          </div>
          <RadarSweep />
        </div>
      </header>

      <div className="rd-wrap">

        {/* ── Spotlight (admin featured) ── */}
        {featured.length > 0 && (
          <RadarSection
            kicker="Spotlight"
            title="Redakcijos pasirinkimai"
            sub="Kūrėjai, kuriuos šią savaitę verta įsidėmėti."
          >
            <FeaturedRow artists={featured} />
          </RadarSection>
        )}

        {/* ── Nauji ir kylantys (auto tinklelis) ── */}
        <RadarSection
          kicker="Radaras"
          title="Nauji ir kylantys"
          sub="Lietuvos atlikėjai ir grupės su naujausiais įkėlimais ir dar nedidele auditorija."
          href="/atlikejai?country=lt"
          hrefLabel="Visi atlikėjai"
        >
          {emerging.length > 0 ? (
            <EmergingGrid artists={emerging} />
          ) : (
            <div className="rd-empty">Šiuo metu radaras kraunamas — užsuk kiek vėliau.</div>
          )}
        </RadarSection>

        {/* ── Šviežios dainos ── */}
        {freshTracks.length > 0 && (
          <RadarSection
            kicker="Šviežia"
            title="Naujausios dainos"
            sub="Paskutiniai įkėlimai nuo kylančių Lietuvos kūrėjų."
            href="/dainos"
            hrefLabel="Visos dainos"
          >
            <FreshTrackList tracks={freshTracks} />
          </RadarSection>
        )}

        {/* ── Pagal stilių ── */}
        {topStyles.length > 0 && (
          <RadarSection kicker="Naršyk" title="Pagal stilių">
            <StyleChips styles={topStyles} />
          </RadarSection>
        )}

        {/* ── Kūrėjo CTA ── */}
        <div className="rd-cta">
          <div className="rd-cta-txt">
            <h3>Esi kūrėjas ar pažįsti kylantį?</h3>
            <p>
              Radaras skirtas naujiems ir mažai žinomiems Lietuvos atlikėjams. Nori patekti
              arba pasiūlyti grupę, kurią verta išgirsti? Parašyk mums — pristatysime tave
              klausytojams. (Pilna pateikimo forma — netrukus.)
            </p>
          </div>
          <div className="rd-cta-actions">
            <Link href="/pokalbiai" className="rd-btn rd-btn-primary" prefetch={false}>Pasiūlyk atlikėją</Link>
            <Link href="/atlikejai?country=lt" className="rd-btn rd-btn-ghost" prefetch={false}>Naršyti atlikėjus</Link>
          </div>
        </div>

        {/* ── SEO proza ── */}
        <div className="rd-prose">
          <p>
            <strong>Naujos muzikos radaras</strong> — vieta, kur renkame naujus ir mažai
            žinomus Lietuvos atlikėjus bei grupes. Čia rasi šviežiausius pasirodymus,
            kylančius kūrėjus ir nepelnytai negirdėtą lietuvišką muziką. Norėdamas daugiau,
            naršyk <Link href="/atlikejai?country=lt">visus Lietuvos atlikėjus</Link>,{' '}
            <Link href="/muzika">muzikos katalogą</Link> arba{' '}
            <Link href="/topai">populiariausius topus</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
