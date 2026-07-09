import { Metadata } from 'next'
import RitmasClient from './RitmasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pataikyk į bitą — ritmo žaidimas | music.lt',
  description: 'Groja tikra dainos ištrauka — baksteli ritmu, kai ratilas sutampa su taikiniu. Serija augina taškus.',
  robots: { index: false, follow: false },
}

export default function RitmasPage() {
  return <RitmasClient />
}
