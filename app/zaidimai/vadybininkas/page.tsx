import { Metadata } from 'next'
import VadybininkasClient from './VadybininkasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Muzikos lyga — sudaryk komandą iš realių atlikėjų | music.lt',
  description: 'Muzikos lyga: sudaryk komandą iš realių atlikėjų — nuo Lietuvos scenos iki pasaulio žvaigždžių. Taškus jie neša pagal tikrus rezultatus: YouTube augimą, topus ir naujas dainas. Savaitės, mėnesio ir sezono lyderiai.',
}

export default function VadybininkasPage() {
  return <VadybininkasClient />
}
