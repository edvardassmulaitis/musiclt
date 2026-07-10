import { Metadata } from 'next'
import RitmasClient from './RitmasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ritmo plytelės — muzikos žaidimas | music.lt',
  description: 'Plytelės krenta pagal tikrą dainą — bakstelk jas ritmu, nepraleisk. Fail-fast su gyvybėmis.',
  robots: { index: false, follow: false },
}

export default function RitmasPage() {
  return <RitmasClient />
}
