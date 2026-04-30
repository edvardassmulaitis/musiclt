import type { Metadata } from 'next'
import { OverviewHub } from '@/components/OverviewHub'

export const metadata: Metadata = {
  title: 'Pramogos — music.lt',
  description: 'Muzikiniai žaidimai, kvizai ir Boombox',
}

const I = {
  boombox: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8" cy="14" r="2"/><circle cx="16" cy="14" r="2"/><path d="M7 8V5a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3"/></svg>,
  game: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12h4M8 10v4"/><circle cx="15" cy="11" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/><path d="M17.32 5H6.68A4.68 4.68 0 0 0 2 9.68V14a4 4 0 0 0 6.7 2.95l.6-.55h5.4l.6.55A4 4 0 0 0 22 14V9.68A4.68 4.68 0 0 0 17.32 5Z"/></svg>,
  quiz: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  hero: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
}

export default function PramogosPage() {
  return (
    <OverviewHub
      title="Pramogos"
      subtitle="Atrask, žaisk, atsipalaiduok. Muzikiniai iššūkiai ir interaktyvūs įrankiai, sukurti kad muzikos klausymasis būtų dar smagiau."
      accent="#f97316"
      icon={I.hero}
      tiles={[
        { label: 'Boombox',  href: '/boombox',  desc: 'Atrask atlikėjus swipe stiliumi — kaip Tinder for music',   icon: I.boombox, accent: '#f97316', big: true },
        { label: 'Žaidimai', href: '/zaidimai', desc: 'Atspėk dainą per 5s, sudėk chronologiją, daily challenge',   icon: I.game,    accent: '#6366f1', soon: true },
        { label: 'Kvizai',   href: '/kvizai',   desc: 'Testai LT muzikos žinovams — 90\'ų rokas, hip-hop ir kt.',   icon: I.quiz,    accent: '#14b8a6', soon: true },
      ]}
    />
  )
}
