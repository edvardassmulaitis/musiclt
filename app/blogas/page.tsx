import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Tinklaraščiai — music.lt',
  description: 'Music.lt vartotojų tinklaraščiai ir straipsniai',
}

export default function BlogIndexPage() {
  return (
    <PlaceholderPage
      title="Tinklaraščiai"
      subtitle="Vartotojų straipsniai apie muziką — koncertų patirtys, atlikėjų portretai, žanrų istorijos ir asmeninės klausymo dienoraščiai."
      accent="#8b5cf6"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 3v6h6"/><path d="M19 9v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z"/><path d="M9 13h6M9 17h4"/>
        </svg>
      }
      features={[
        { title: 'Naujausi įrašai',     desc: 'Šviežiausios mintys iš bendruomenės' },
        { title: 'Pagal kategorijas',   desc: 'Recenzijos, interviu, esė, dienoraščiai' },
        { title: 'Top autoriai',        desc: 'Aktyviausi ir mėgstamiausi blogeriai' },
        { title: 'Tavo tinklaraštis',   desc: 'Pradėk savo blogą per kelias minutes' },
      ]}
      exploreLinks={[
        { label: 'Mano blogas',  href: '/blogas/mano' },
        { label: 'Rašyti įrašą', href: '/blogas/rasyti' },
        { label: 'Diskusijos',   href: '/diskusijos' },
      ]}
    />
  )
}
