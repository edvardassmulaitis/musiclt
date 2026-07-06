import { Metadata } from 'next'
import VaizdasClient from './VaizdasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atspėk iš vaizdo — koks šis albumas? | music.lt',
  description: 'Albumo viršelis ryškėja kas sekundę — atspėk populiarų albumą kuo greičiau ir surink daugiau taškų!',
}

export default function AtspekIsVaizdoPage() {
  return <VaizdasClient />
}
