import { Metadata } from 'next'
import GaudykleClient from './GaudykleClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atlikėjų gaudyklė — greitas žaidimas | music.lt',
  description: 'Gaudyk krentančius atlikėjus krepšeliu — daugiau taškų už populiaresnius. 45 sekundės.',
  robots: { index: false, follow: false },
}

export default function GaudyklePage() {
  return <GaudykleClient />
}
