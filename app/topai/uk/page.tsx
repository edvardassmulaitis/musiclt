import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'JK (UK) muzikos topai — Official UK Charts | Music.lt',
  description: 'Jungtinės Karalystės muzikos topai: UK TOP 100, agreguoti Official UK, Spotify ir Apple Music duomenys, atnaujinami kas savaitę.',
  keywords: ['uk topai', 'jk topai', 'official uk charts', 'britanijos topai', 'uk dainų topai', 'music.lt'],
  alternates: { canonical: '/topai/uk' },
  openGraph: { title: 'JK (UK) muzikos topai', description: 'Jungtinės Karalystės dainų topai — Official UK, Spotify ir Apple Music duomenys.', url: '/topai/uk', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="uk" />
}
