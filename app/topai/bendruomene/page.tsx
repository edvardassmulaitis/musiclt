import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Music.lt bendruomenės topai — TOP 40 ir LT TOP 30 | Music.lt',
  description: 'Music.lt bendruomenės balsavimu sudaromi topai: Music.lt TOP 40 ir LT TOP 30. Balsuok už mėgstamas dainas kiekvieną savaitę.',
  keywords: ['music.lt top 40', 'lt top 30', 'bendruomenės topai', 'balsavimo topai', 'klausytojų topai', 'music.lt'],
  alternates: { canonical: '/topai/bendruomene' },
  openGraph: { title: 'Music.lt bendruomenės topai', description: 'Music.lt TOP 40 ir LT TOP 30 — bendruomenės balsavimu sudaromi savaitės topai.', url: '/topai/bendruomene', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="community" />
}
