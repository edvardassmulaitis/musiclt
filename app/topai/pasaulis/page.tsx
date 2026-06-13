import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Pasaulio muzikos topai — Global, JAV, JK | Music.lt',
  description: 'Pasaulio muzikos topai vienoje vietoje: Global TOP 100, Viral TOP 20 ir albumai. Agreguoti Spotify Global, Billboard ir Shazam duomenys, atnaujinami kas savaitę.',
  keywords: ['pasaulio topai', 'global top', 'spotify global', 'billboard topai', 'viral topai', 'pasaulio dainų topai', 'music.lt'],
  alternates: { canonical: '/topai/pasaulis' },
  openGraph: { title: 'Pasaulio muzikos topai', description: 'Pasaulio dainų ir albumų topai — Spotify Global, Billboard, Shazam ir Music.lt TOP 40.', url: '/topai/pasaulis', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="world" />
}
