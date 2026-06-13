import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Lietuvos muzikos topai — dainos ir albumai | Music.lt',
  description: 'Lietuvos muzikos topai vienoje vietoje: Lietuvos TOP 100, LT TOP 30 ir albumai. Agreguoti AGATA, Spotify, Apple Music ir Shazam duomenys, atnaujinami kas savaitę.',
  keywords: ['lietuvos topai', 'lietuviškos muzikos topai', 'lt top 30', 'lietuvos dainų topai', 'AGATA topai', 'music.lt'],
  alternates: { canonical: '/topai/lietuva' },
  openGraph: { title: 'Lietuvos muzikos topai', description: 'Lietuvos dainų ir albumų topai — AGATA, Spotify, Apple Music, Shazam ir Music.lt LT TOP 30.', url: '/topai/lietuva', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="lt" />
}
