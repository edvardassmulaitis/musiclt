import { Metadata } from 'next'
import VadybininkasClient from './VadybininkasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Muzikos vadybininkas — fantasy lyga | music.lt',
  description: 'Sudaryk komandą iš 5 realių Lietuvos atlikėjų — taškus jie neša pagal tikrus rezultatus: YouTube augimą, topus ir naujus releizus. Savaitės, mėnesio ir sezono lyderiai.',
}

export default function VadybininkasPage() {
  return <VadybininkasClient />
}
