import { Metadata } from 'next'
import KoncertasClient from './KoncertasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Dienos koncertas — muzikos žaidimas | music.lt',
  description: 'Kasdien vienas atlikėjas ir jo dainų setas. Baksteli hype iš minios, o dainos energija valdo siautulį — finale didžiausi hitai.',
  robots: { index: false, follow: false },
}

export default function KoncertasPage() {
  return <KoncertasClient />
}
