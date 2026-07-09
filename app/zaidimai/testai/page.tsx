import { Metadata } from 'next'
import TestaiClient from './TestaiClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Žaidimų testavimas | music.lt',
  robots: { index: false, follow: false },
}

export default function TestaiPage() {
  return <TestaiClient />
}
