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
      subtitle="Naršyk visus Lietuvos atlikėjų albumus — filtruok pagal žanrą, metus, atlikėją, ar perklausyk pilnai."
      accent="#f59e0b"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
        </svg>
      }
      features={[
        { title: 'Naujausi albumai',    desc: 'Šviežiausi releases iš lietuviškos scenos' },
        { title: 'Visų laikų klasika',  desc: 'Geriausi albumai pagal vartotojų balsavimą' },
        { title: 'Pagal žanrus',        desc: 'Roko, hip-hopo, electronicos, pop kolekcijos' },
        { title: 'Skaityk apžvalgas',   desc: 'Vartotojų komentarai ir įvertinimai' },
      ]}
      exploreLinks={[
        { label: 'Atlikėjai',    href: '/atlikejai' },
        { label: 'Dienos daina', href: '/dienos-daina' },
      ]}
    />
  )
}
