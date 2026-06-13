import type { Metadata } from 'next'
import { getFestivals } from '@/lib/supabase-events'
import FestivalsClient from './festivals-client'

export const metadata: Metadata = {
  title: 'Muzikos festivaliai Lietuvoje – line-up\'ai, datos, archyvas | music.lt',
  description:
    'Lietuvos muzikos festivaliai: būsimi ir praėję festivaliai, pilni line-up\'ai, dalyvavę atlikėjai, datos ir vietos. Granatos, Karklė, Mėnuo Juodaragis, Positivus ir kiti — vienoje vietoje.',
  alternates: { canonical: '/festivaliai' },
  openGraph: {
    title: 'Muzikos festivaliai Lietuvoje | music.lt',
    description: 'Būsimi ir praėję Lietuvos muzikos festivaliai su pilnais line-up\'ais ir dalyvavusiais atlikėjais.',
    type: 'website',
  },
}

// Festivalių nedaug (~dešimtys) — visus paimam vienu kartu, filtravimas kliento
// pusėje (momentinis). ISR 10 min.
export const revalidate = 600

export default async function FestivalsPage() {
  const festivals = await getFestivals({ limit: 400 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://musiclt.vercel.app'
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = festivals.filter((f: any) => (f.end_date || f.start_date || '').slice(0, 10) >= today)

  // JSON-LD: ItemList iš būsimų (jei yra) arba naujausių festivalių.
  const listSrc = (upcoming.length ? upcoming : festivals).slice(0, 25)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Muzikos festivaliai Lietuvoje',
    itemListElement: listSrc.map((f: any, i: number) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Festival',
        name: f.title,
        url: `${siteUrl}/festivaliai/${f.slug}`,
        ...(f.start_date ? { startDate: f.start_date } : {}),
        ...(f.end_date ? { endDate: f.end_date } : {}),
        ...(f.cover_image_url ? { image: f.cover_image_url } : {}),
        ...(f.city
          ? { location: { '@type': 'Place', name: f.venue_name || f.city, address: { '@type': 'PostalAddress', addressLocality: f.city, addressCountry: 'LT' } } }
          : {}),
      },
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FestivalsClient festivals={festivals as any} />
    </>
  )
}
