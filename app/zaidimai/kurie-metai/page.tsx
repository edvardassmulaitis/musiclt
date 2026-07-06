import { Metadata } from 'next'
import MetaiClient from './MetaiClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kurie metai? — atspėk albumo išleidimo metus | music.lt',
  description: 'Populiaraus albumo viršelis — atspėk, kuriais metais jis išleistas. 8 raundai, taškai už greitį.',
}

export default function KurieMetaiPage() {
  return <MetaiClient />
}
