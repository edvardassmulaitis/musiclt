import { Metadata } from 'next'
import SekundesClient from './SekundesClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atspėk iš sekundės — kiek hitų atpažinsi? | music.lt',
  description: 'Groja 1 sekundė dainos — atspėk ją. Reikia daugiau? Klausyk ilgiau, bet gausi mažiau taškų.',
}

export default function AtspekIsSekundesPage() {
  return <SekundesClient />
}
