import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Naujienos — music.lt',
  description: 'Lietuvos ir pasaulio muzikos naujienos',
}

export default function NewsIndexPage() {
  return (
    <PlaceholderPage
      title="Naujienos"
      subtitle="Scenos pulsas — singlų releases, turų anonsai, interviu, recenzijos ir tai, apie ką kalba muzikos pasaulis."
      accent="#3b82f6"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>
        </svg>
      }
      features={[
        { title: 'Naujausi įrašai',       desc: 'Singlai, EP, albumai — ką tik išleisti' },
        { title: 'Atlikėjų interviu',     desc: 'Pokalbiai su lietuviškos scenos žmonėmis' },
        { title: 'Recenzijos',            desc: 'Albumų ir koncertų apžvalgos' },
        { title: 'Industrijos pulsas',    desc: 'Ką veikia label\'ai, festivaliai, plokštelės' },
      ]}
      exploreLinks={[
        { label: 'Atlikėjai',  href: '/atlikejai' },
        { label: 'Renginiai',  href: '/renginiai' },
        { label: 'Diskusijos', href: '/diskusijos' },
      ]}
    />
  )
}
