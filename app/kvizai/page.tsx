import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Kvizai — music.lt',
  description: 'Muzikiniai kvizai ir testai',
}

export default function QuizzesPage() {
  return (
    <PlaceholderPage
      title="Kvizai"
      subtitle="Testas LT roko žinovams, 90'ų popso ekspertams, festivalių lankytojams — kiek tu iš tikrųjų žinai apie Lietuvos muziką?"
      accent="#14b8a6"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      }
      features={[
        { title: 'Tematiniai kvizai',     desc: '90\'ų LT rokas, hip-hop pradžia, popsas, electronic' },
        { title: 'Atlikėjų portretai',    desc: '"Kuris iš šių atlikėjų...?" tipo iššūkiai' },
        { title: 'Daiktų istorijos',      desc: 'Pasakok dainos istoriją iš detalių' },
        { title: 'Bendruomenės kvizai',   desc: 'Vartotojų sukurti — kuris tinka būtent tau' },
      ]}
      exploreLinks={[
        { label: 'Boombox',     href: '/boombox' },
        { label: 'Žaidimai',    href: '/zaidimai' },
        { label: 'Apdovanojimai', href: '/apdovanojimai' },
      ]}
    />
  )
}
