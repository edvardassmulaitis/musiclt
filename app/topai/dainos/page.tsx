import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Dainų topai — populiariausios dainos | Music.lt',
  description: 'Populiariausių dainų topai vienoje vietoje: Lietuvos, JAV, JK ir pasaulio dainų reitingai. Agreguoti AGATA, Spotify, Apple Music, Billboard ir Shazam duomenys.',
  keywords: ['dainų topai', 'populiariausios dainos', 'dainos topai', 'top dainos', 'spotify dainos', 'music.lt'],
  alternates: { canonical: '/topai/dainos' },
  openGraph: { title: 'Dainų topai — populiariausios dainos', description: 'Populiariausių dainų topai — Lietuva, JAV, JK ir pasaulis vienoje vietoje.', url: '/topai/dainos', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="songs" />
}
