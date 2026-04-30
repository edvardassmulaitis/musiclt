import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Žanrai ir stiliai — music.lt',
  description: 'Naršyk muziką pagal žanrus ir stilius',
}

export default function GenresPage() {
  return (
    <PlaceholderPage
      title="Žanrai ir stiliai"
      subtitle="Roko vakarai, hip-hopo elite, jazz subtlety arba folk šaknys — atrask muziką pagal tai, ko šiandien nori klausytis."
      accent="#a855f7"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12 5 5l7 2 7-2 2 7-2 7-7-2-7 2Z"/><circle cx="12" cy="12" r="3"/>
        </svg>
      }
      features={[
        { title: 'Pagrindiniai žanrai',   desc: 'Rokas, popsas, hip-hop, electronic, folk, jazz, klasika' },
        { title: 'Substyles',             desc: 'Indie rock, trap, lo-fi, ambient, neofolk ir kiti' },
        { title: 'Pagal nuotaiką',        desc: 'Energingas, rami, melancholiška, šokio' },
        { title: 'Žanro topai',           desc: 'Geriausi atlikėjai ir albumai kiekvienoje kategorijoje' },
      ]}
      exploreLinks={[
        { label: 'Atlikėjai', href: '/atlikejai' },
        { label: 'Albumai',   href: '/albumai' },
        { label: 'Topai',     href: '/topas' },
      ]}
    />
  )
}
