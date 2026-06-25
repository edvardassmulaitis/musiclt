import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Lietuvos ir pasaulio muzikos topai | Music.lt',
  description: 'Visi muzikos topai vienoje vietoje: Music.lt TOP 40 ir LT TOP 30, Lietuvos, JAV, JK bei pasaulio dainų ir albumų reitingai. Agreguoti AGATA, Spotify, Apple Music, Billboard, Official UK ir Shazam duomenys, atnaujinami kas savaitę.',
  keywords: ['muzikos topai', 'top 40', 'lietuvos topai', 'dainų topai', 'albumų topai', 'AGATA', 'Spotify topai', 'Billboard', 'Shazam', 'music.lt'],
  alternates: { canonical: '/topai' },
  openGraph: {
    title: 'Lietuvos ir pasaulio muzikos topai',
    description: 'Music.lt TOP 40, LT TOP 30 ir agreguoti Lietuvos bei pasaulio dainų ir albumų topai vienoje vietoje.',
    url: '/topai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lietuvos ir pasaulio muzikos topai | Music.lt',
    description: 'Lietuvos ir pasaulio muzikos topai vienoje vietoje, atnaujinami kas savaitę.',
  },
}

// ISR: topai atnaujinami daugiausia kas savaitę (voting) / kasdien (išoriniai),
// tad 30 min cache stipriai pagerina TTFB ir SEO crawl'ą lyginant su force-dynamic.
export const revalidate = 1800

export default function TopaiHubPage() {
  return <TopaiHub view="all" />
}
