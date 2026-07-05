import { Metadata } from 'next'
import VadybininkasClient from './VadybininkasClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Muzikos vadybininkas | music.lt',
  description: 'Pasamdyk 3 realius Lietuvos atlikėjus už biudžetą ir išgyvenk metus muzikos versle. Festivaliai, TikTok virusai, skandalai — kiek verta tavo agentūra?',
}

export default function VadybininkasPage() {
  return <VadybininkasClient />
}
