import { Metadata } from 'next'
import VaizdasClient from './VaizdasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atspėk iš vaizdo — kas šis atlikėjas? | music.lt',
  description: 'Nuotrauka ryškėja kas sekundę — atspėk Lietuvos atlikėją kuo greičiau ir surink daugiau taškų!',
}

export default function AtspekIsVaizdoPage() {
  return <VaizdasClient />
}
