import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Albumai — music.lt',
  description: 'Visi albumai vienoje vietoje',
}

export default function AlbumsIndexPage() {
  return (
    <PlaceholderPage
      title="Albumai"
      subtitle="Test."
      icon={null}
    />
  )
}
