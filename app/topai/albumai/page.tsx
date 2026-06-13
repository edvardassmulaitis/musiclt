import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Albumų topai — populiariausi albumai | Music.lt',
  description: 'Populiariausių albumų topai vienoje vietoje: Lietuvos ir pasaulio albumų reitingai. Agreguoti Billboard 200, Official UK ir AGATA duomenys, atnaujinami kas savaitę.',
  keywords: ['albumų topai', 'populiariausi albumai', 'albumai topai', 'billboard 200', 'lietuvos albumai', 'music.lt'],
  alternates: { canonical: '/topai/albumai' },
  openGraph: { title: 'Albumų topai — populiariausi albumai', description: 'Populiariausių albumų topai — Lietuvos ir pasaulio reitingai.', url: '/topai/albumai', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="albums" />
}
