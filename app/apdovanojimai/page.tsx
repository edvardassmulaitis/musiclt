import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Apdovanojimai — music.lt',
  description: 'Lietuvos muzikos apdovanojimai ir laureatai',
}

export default function AwardsPage() {
  return (
    <PlaceholderPage
      title="Apdovanojimai"
      subtitle="M.A.M.A., Bravo, Auksinis fonografas ir kiti — visi pagrindiniai Lietuvos muzikos apdovanojimai vienoje vietoje."
      accent="#eab308"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/>
        </svg>
      }
      features={[
        { title: 'Apdovanojimų istorija',  desc: 'Visi laureatai per metus ir kategorijas' },
        { title: 'Atlikėjų reitingas',     desc: 'Kas surinko daugiausia apdovanojimų' },
        { title: 'Nominacijos šiemet',     desc: 'Aktualios nominacijos ir balsavimo terminai' },
        { title: 'Bendruomenės balsai',    desc: 'Vartotojų pasirinkti favoritai vs oficialūs sprendimai' },
      ]}
      exploreLinks={[
        { label: 'Balsavimai', href: '/balsavimai' },
        { label: 'Topai',      href: '/topas' },
        { label: 'Atlikėjai',  href: '/atlikejai' },
      ]}
    />
  )
}
