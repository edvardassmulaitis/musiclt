import { Metadata } from 'next'
import GaudykleClient from './GaudykleClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Natų gaudyklė — greitas žaidimas | music.lt',
  description: 'Gaudyk krentančias natas krepšeliu, venk bombų. Be garso, veikia visur.',
  robots: { index: false, follow: false },
}

export default function GaudyklePage() {
  return <GaudykleClient />
}
