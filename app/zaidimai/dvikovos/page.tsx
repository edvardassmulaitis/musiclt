import { Metadata } from 'next'
import DvikovosClient from './DvikovosClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dainų dvikovos | music.lt',
  description: 'Dvi dainos — vienas balsas. Balsuok dainų dvikovose ir pamatyk, ką renkasi bendruomenė.',
}

export default function DvikovosPage() {
  return <DvikovosClient />
}
