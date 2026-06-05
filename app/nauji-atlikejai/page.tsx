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
  getFeaturedArtists, getEmergingArtists, getFreshTracks,
} from '@/lib/radaras'
import { radarStyles, RadarSweep, RadarSection } from '@/components/radaras-ui'
import RadarBrowse from '@/components/radaras-browse'
import RadarFresh from '@/components/radaras-fresh'
import RadarFeatured from '@/components/radaras-featured'

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
  const [featured, emerging, freshTracks] = await Promise.all([
    getFeaturedArtists(),
    getEmergingArtists(48),
    getFreshTracks(16),
  ])

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

      {/* ── Hero (kompaktiškas) ── */}
      <header className="rd-hero">
        <div className="rd-hero-inner">
          <div className="rd-hero-txt">
            <span className="rd-hero-tag"><span className="rd-pulse" aria-hidden /> Naujos muzikos radaras</span>
            <h1>Nauji atlikėjai</h1>
            <p className="rd-hero-lead">
              Kylantys ir dar mažai kam žinomi kūrėjai — atrask juos pirmas.
            </p>
          </div>
          <RadarSweep />
        </div>
      </header>

      <div className="rd-wrap">

        {/* ── Dėmesio centre (admin featured) ── */}
        {featured.length > 0 && (
          <RadarSection title="Dėmesio centre">
            <RadarFeatured artists={featured} />
          </RadarSection>
        )}

        {/* ── Nauji ir kylantys (filtrai viršuje + tinklelis) ── */}
        <RadarSection
          kicker="Radaras"
          title="Nauji ir kylantys"
          sub="Atlikėjai ir grupės su naujausiais įkėlimais ir dar nedidele auditorija. Filtruok pagal šalį ir stilių."
        >
          {emerging.length > 0 ? (
            <RadarBrowse artists={emerging} />
          ) : (
            <div className="rd-empty">Šiuo metu radaras kraunamas — užsuk kiek vėliau.</div>
          )}
        </RadarSection>

        {/* ── Šviežios dainos: sąrašas + grotuvas ── */}
        {freshTracks.length > 0 && (
          <RadarSection
            kicker="Šviežia"
            title="Naujausios dainos"
            sub="Paskutiniai įkėlimai nuo kylančių kūrėjų — spausk ir klausyk čia pat."
          >
            <RadarFresh tracks={freshTracks} />
          </RadarSection>
        )}

        {/* ── Kūrėjo CTA ── */}
        <div className="rd-cta">
          <div className="rd-cta-txt">
            <h3>Esi kūrėjas ar pažįsti kylantį?</h3>
            <p>
              Radaras skirtas naujiems ir mažai žinomiems Lietuvos atlikėjams. Pasiūlyk save
              arba grupę, kurią verta išgirsti — užpildyk trumpą formą, o mes peržiūrėsime ir
              pristatysime klausytojams.
            </p>
          </div>
          <div className="rd-cta-actions">
            <Link href="/nauji-atlikejai/pateikti" className="rd-btn rd-btn-primary" prefetch={false}>Pasiūlyk atlikėją</Link>
            <Link href="/atlikejai?country=lt" className="rd-btn rd-btn-ghost" prefetch={false}>Naršyti atlikėjus</Link>
          </div>
        </div>

        {/* ── SEO proza ── */}
        <div className="rd-prose">
          <p>
            <strong>Naujos muzikos radaras</strong> — vieta, kur renkame naujus ir mažai
            žinomus atlikėjus bei grupes. Čia rasi šviežiausius pasirodymus, kylančius
            kūrėjus ir nepelnytai negirdėtą muziką — gali filtruoti tik lietuviškus. Norėdamas
            daugiau, naršyk <Link href="/atlikejai?country=lt">Lietuvos atlikėjus</Link>,{' '}
            <Link href="/muzika">muzikos katalogą</Link> arba{' '}
            <Link href="/topai">populiariausius topus</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
