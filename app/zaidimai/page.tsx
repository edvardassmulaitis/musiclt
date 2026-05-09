import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Žaidimai — music.lt',
  description: 'Muzikiniai žaidimai ir iššūkiai',
}

export default function GamesPage() {
  return (
    <PlaceholderPage
      title="Žaidimai"
      subtitle="Mažos pramogos visam vakarui — atspėk dainą per 5 sekundes, sudėk įgrojimo eilę pagal metus, surask atlikėjus pagal žanrą."
      accent="#6366f1"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/>
          <path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/>
        </svg>
      }
      features={[
        { title: 'Atspėk dainą',     desc: '5s ištrauka — kas atlikėjas? Kas albumas? Kas metai?' },
        { title: 'Chronologijos žaidimas', desc: 'Sudėk dainas pagal išleidimo metus' },
        { title: 'Atlikėjų portretai',     desc: 'Atspėk pagal jaunystės nuotrauką' },
        { title: 'Daily challenge',  desc: 'Kasdien naujas iššūkis ir global leaderboard\'as' },
      ]}
      exploreLinks={[
        { label: 'Boombox',      href: '/boombox' },
        { label: 'Kvizai',       href: '/kvizai' },
        { label: 'Dienos daina', href: '/dienos-daina' },
      ]}
    />
  )
}
