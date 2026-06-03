import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Koncertų įrašai — live pasirodymų vaizdo įrašai | music.lt',
  description: 'Live pasirodymų vaizdo įrašai iš Lietuvos ir užsienio scenos — koncertų archyvas pagal atlikėją ir renginį.',
}

export default function KoncertuIrasaiPage() {
  return (
    <PlaceholderPage
      title="Koncertų įrašai"
      subtitle="Live pasirodymų vaizdo įrašai iš Lietuvos ir užsienio scenos — koncertų archyvas pagal atlikėją ir renginį."
      accent="#8b5cf6"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4V8z"/>
        </svg>
      }
      features={[
        { title: 'Live vaizdo įrašai', desc: 'Pilni koncertai ir atskiros dainos iš scenos — sukaupti vienoje vietoje' },
        { title: 'Pagal atlikėją', desc: 'Visi konkretaus atlikėjo pasirodymų įrašai susieti su jo profiliu' },
        { title: 'Pagal renginį', desc: 'Įrašai prisegti prie konkretaus koncerto ar festivalio puslapio' },
        { title: 'Lietuvos scenos archyvas', desc: 'Istoriniai pasirodymai ir naujausi koncertai' },
      ]}
      exploreLinks={[
        { label: 'Koncertai Lietuvoje', href: '/koncertai' },
        { label: 'Atlikėjai', href: '/atlikejai' },
        { label: 'Foto galerija', href: '/galerija' },
      ]}
    />
  )
}
