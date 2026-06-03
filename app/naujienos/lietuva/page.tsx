// app/naujienos/lietuva/page.tsx — Lietuvos muzikos naujienos (SEO landing).
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/artist-browse'
import NewsLanding from '@/components/naujienos/NewsLanding'

export const revalidate = 300

const TITLE = 'Lietuvos muzikos naujienos — atlikėjai, koncertai, scena | music.lt'
const DESC =
  'Naujausios Lietuvos muzikos naujienos: lietuvių atlikėjų albumai ir singlai, koncertai, turai, interviu ir scenos įvykiai.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/naujienos/lietuva` },
  openGraph: { type: 'website', title: TITLE, description: DESC, url: `${SITE_URL}/naujienos/lietuva`, siteName: 'music.lt', locale: 'lt_LT' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

export default function LietuvaNewsPage() {
  return (
    <NewsLanding
      h1="Lietuvos muzikos naujienos"
      intro="Lietuvių atlikėjų scena — nauji albumai ir singlai, koncertai, turai, apdovanojimai ir interviu. Viskas apie LT muziką vienoje vietoje."
      path="/naujienos/lietuva"
      crumb="Lietuva"
      accent="#16a34a"
      icon="🇱🇹"
      lockedScope="lt"
    />
  )
}
