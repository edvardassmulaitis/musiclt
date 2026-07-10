import { Metadata } from 'next'
import RitmasClient from './RitmasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pataikyk į taktą — muzikos žaidimas | music.lt',
  description: 'Taikiniai atsiranda tiksliai ant dainos bitų — bakstelėk, kai žiedas užsidaro. Timing, serijos, gyvybės.',
  robots: { index: false, follow: false },
}

export default function RitmasPage() {
  return <RitmasClient />
}
