import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'JAV muzikos topai — Billboard Hot 100 | Music.lt',
  description: 'JAV muzikos topai: JAV TOP 100, agreguoti Billboard Hot 100, Spotify ir Apple Music duomenys, atnaujinami kas savaitę.',
  keywords: ['jav topai', 'amerikos topai', 'billboard hot 100', 'billboard topai', 'jav dainų topai', 'music.lt'],
  alternates: { canonical: '/topai/jav' },
  openGraph: { title: 'JAV muzikos topai', description: 'JAV dainų topai — Billboard Hot 100, Spotify ir Apple Music duomenys.', url: '/topai/jav', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="us" />
}
