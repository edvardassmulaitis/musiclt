import { Metadata } from 'next'
import RitmasClient from './RitmasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Skrisk pro bitą — muzikos žaidimas | music.lt',
  description: 'Skrisk pro tunelį, kurio sienos juda pagal tikrą dainos garsumą. Laikai — kyla, paleidi — leidžiasi.',
  robots: { index: false, follow: false },
}

export default function RitmasPage() {
  return <RitmasClient />
}
