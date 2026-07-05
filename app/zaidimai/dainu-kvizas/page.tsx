import { Metadata } from 'next'
import KvizasClient from './KvizasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Atspėk dainą — muzikos kvizas | music.lt',
  description: 'Groja ištrauka — atspėk dainą per 15 sekundžių. Lietuviška klasika, nauja banga ir pasaulio hitai. Rink taškus!',
}

export default function DainuKvizasPage() {
  return <KvizasClient />
}
