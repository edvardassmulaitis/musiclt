import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Vartotojai — music.lt',
  description: 'Music.lt bendruomenės nariai',
}

export default function UsersIndexPage() {
  return (
    <PlaceholderPage
      title="Vartotojai"
      subtitle="Aktyviausi music.lt nariai — kas daugiausia rašo apžvalgų, kas pirmas pasidalina naujomis dainomis, kas keičia diskusijų toną."
      accent="#f97316"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      }
      features={[
        { title: 'Aktyviausi nariai',     desc: 'Kas labiausiai aktyvus paskutinį mėnesį' },
        { title: 'Top blogeriai',         desc: 'Geriausių apžvalgų autoriai' },
        { title: 'Pagal pomėgius',        desc: 'Surask žmones, kurie klauso to paties' },
        { title: 'Naujausi nariai',       desc: 'Pasveikink ką tik prisijungusius' },
      ]}
      exploreLinks={[
        { label: 'Pokalbiai',     href: '/pokalbiai' },
        { label: 'Diskusijos',    href: '/diskusijos' },
        { label: 'Tinklaraščiai', href: '/blogas' },
      ]}
    />
  )
}
