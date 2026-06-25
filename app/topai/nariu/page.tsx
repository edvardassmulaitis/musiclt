import { Metadata } from 'next'
import TopaiHub from '@/components/topai/TopaiHub'

export const metadata: Metadata = {
  title: 'Bendruomenės topai — narių sudaryti sąrašai | Music.lt',
  description: 'Music.lt narių sudaryti topai: mėgstamiausių atlikėjų, albumų ir dainų numeruoti sąrašai. Sukurk savo topą ir dalinkis su bendruomene.',
  keywords: ['bendruomenės topai', 'narių topai', 'vartotojų topai', 'mėgstamiausių sąrašas', 'music.lt'],
  alternates: { canonical: '/topai/nariu' },
  openGraph: { title: 'Bendruomenės topai — narių sudaryti sąrašai', description: 'Music.lt narių sudaryti mėgstamiausių atlikėjų, albumų ir dainų topai.', url: '/topai/nariu', type: 'website' },
}

export const revalidate = 1800

export default function Page() {
  return <TopaiHub view="members" />
}
