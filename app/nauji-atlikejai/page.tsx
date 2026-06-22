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
import { isLtCountry } from '@/lib/radaras-shared'
import { radarStyles, RadarSection } from '@/components/radaras-ui'
import { RadarSweepMini } from '@/components/RadarSweepMini'
import RadarBrowse from '@/components/radaras-browse'
import RadarFresh from '@/components/radaras-fresh'
import RadarFeatured from '@/components/radaras-featured'
import RadarSubmitButton from '@/components/radaras-submit-button'

// ISR — radaras atsinaujina su naujais įkėlimais; perskaičiuojam kas 30 min.
export const revalidate = 1800

const TITLE = 'Nauji atlikėjai — naujos muzikos radaras | music.lt'
const DESCRIPTION =
  'Naujos muzikos radaras: nauji ir mažai žinomi Lietuvos ir užsienio atlikėjai bei ' +
  'grupės, šviežiausios dainos ir kylantys kūrėjai. Atrask, ką verta išgirsti pirmas.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['nauji atlikėjai', 'nauja muzika', 'kylantys atlikėjai', 'naujos grupės',
    'nauja lietuviška muzika', 'lietuviški atlikėjai', 'užsienio atlikėjai',
    'emerging artists', 'emerging artists Lietuva'],
  alternates: { canonical: `${SITE_URL}/nauji-atlikejai` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/nauji-atlikejai`, type: 'website' },
}

export default async function NaujiAtlikejaiPage() {
  const [featured, emerging, freshTracks] = await Promise.all([
    getFeaturedArtists(),
    getEmergingArtists(48),
    getFreshTracks(16),
  ])

  // Atskiriam į dvi sekcijas (Lietuva / užsienis) — UI aiškumui.
  const ltEmerging = emerging.filter((a) => isLtCountry(a.country))
  const foreignEmerging = emerging.filter((a) => !isLtCountry(a.country))

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
          <RadarSweepMini size={150} className="rd-sweep" />
        </div>
      </header>

      <div className="rd-wrap">

        {/* ── Dėmesio centre (admin featured) ── */}
        {featured.length > 0 && (
          <RadarSection title="Dėmesio centre">
            <RadarFeatured artists={featured} />
          </RadarSection>
        )}

        {/* ── Nauji ir kylantys IŠ LIETUVOS ── */}
        <RadarSection
          title="Nauji ir kylantys iš Lietuvos"
          sub="Lietuvos atlikėjai ir grupės, neseniai išleidę naujų dainų, bet dar mažai kam žinomi. Filtruok pagal stilių."
        >
          {ltEmerging.length > 0 ? (
            <RadarBrowse artists={ltEmerging} hideCountry />
          ) : (
            <div className="rd-empty">Šiuo metu radaras kraunamas — užsuk kiek vėliau.</div>
          )}
        </RadarSection>

        {/* ── Nauji ir kylantys IŠ UŽSIENIO ── */}
        {foreignEmerging.length > 0 && (
          <RadarSection
            title="Nauji ir kylantys iš užsienio"
            sub="Daug žadantys užsienio kūrėjai — įvairūs stiliai, dar neperaugę į megažvaigždes. Atrask juos pirmas."
          >
            <RadarBrowse artists={foreignEmerging} hideCountry />
          </RadarSection>
        )}

        {/* ── Šviežios dainos: sąrašas + grotuvas ── */}
        {freshTracks.length > 0 && (
          <RadarSection
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
              Radaras skirtas naujiems ir mažai žinomiems kūrėjams — iš Lietuvos ir iš
              užsienio. Pasiūlyk save arba atlikėją, kurį verta išgirsti — užpildyk trumpą
              formą, o mes peržiūrėsime ir pristatysime klausytojams.
            </p>
          </div>
          <div className="rd-cta-actions">
            <RadarSubmitButton />
            <Link href="/atlikejai" className="rd-btn rd-btn-ghost" prefetch={false}>Naršyti atlikėjus</Link>
          </div>
        </div>

        {/* ── SEO proza ── */}
        <div className="rd-prose">
          <p>
            <strong>Naujos muzikos radaras</strong> — vieta, kur renkame naujus ir mažai
            žinomus atlikėjus bei grupes iš Lietuvos ir iš užsienio. Čia rasi šviežiausius
            pasirodymus, kylančius kūrėjus ir nepelnytai negirdėtą muziką — tiek lietuvišką,
            tiek pasaulinę. Norėdamas daugiau, naršyk{' '}
            <Link href="/atlikejai">visus atlikėjus</Link>,{' '}
            <Link href="/muzika">muzikos katalogą</Link> arba{' '}
            <Link href="/topai">populiariausius topus</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
