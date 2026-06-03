// app/naujienos/pasaulis/page.tsx — Pasaulio muzikos naujienos (SEO landing).
import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/artist-browse'
import NewsLanding from '@/components/naujienos/NewsLanding'

export const revalidate = 300

const TITLE = 'Pasaulio muzikos naujienos — albumai, turai, scena | music.lt'
const DESC =
  'Naujausios pasaulio muzikos naujienos lietuviškai: užsienio atlikėjų albumai ir singlai, turai, festivaliai, kolaboracijos ir scenos įvykiai.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${SITE_URL}/naujienos/pasaulis` },
  openGraph: { type: 'website', title: TITLE, description: DESC, url: `${SITE_URL}/naujienos/pasaulis`, siteName: 'music.lt', locale: 'lt_LT' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}

export default function PasaulisNewsPage() {
  return (
    <NewsLanding
      h1="Pasaulio muzikos naujienos"
      intro="Užsienio muzikos scena lietuviškai — nauji albumai ir singlai, pasauliniai turai, festivaliai bei kolaboracijos. Svarbiausios žinios viena vietoje."
      path="/naujienos/pasaulis"
      crumb="Pasaulis"
      accent="#0ea5e9"
      icon="🌍"
      lockedScope="world"
    />
  )
}
