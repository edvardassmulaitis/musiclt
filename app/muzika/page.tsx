import type { Metadata } from 'next'
import { OverviewHub } from '@/components/OverviewHub'

export const metadata: Metadata = {
  title: 'Muzika — music.lt',
  description: 'Lietuvos muzikos scenos centras — atlikėjai, albumai, topai',
}

const I = {
  artist: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/></svg>,
  album: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>,
  song: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/></svg>,
  vote: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>,
  award: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.21 13.89 7 22l5-3 5 3-1.21-8.11"/></svg>,
  genre: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12 5 5l7 2 7-2 2 7-2 7-7-2-7 2Z"/><circle cx="12" cy="12" r="3"/></svg>,
  hero: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
}

export default function MuzikaPage() {
  return (
    <OverviewHub
      title="Muzika"
      subtitle="Lietuvos scenos centras — atlikėjai, albumai, topai ir balsavimai. Visa svarbiausia muzika vienoje vietoje."
      accent="#f59e0b"
      icon={I.hero}
      tiles={[
        { label: 'Atlikėjai ir grupės', href: '/atlikejai',    desc: 'Naršyk Lietuvos scenos žemėlapį — nuo legendų iki naujokų',     icon: I.artist, accent: '#f59e0b', big: true },
        { label: 'Topai',               href: '/topai',        desc: 'TOP 40, LT TOP 30 ir kiti reitingai',                           icon: I.trophy, accent: '#ef4444' },
        { label: 'Balsavimai',          href: '/balsavimai',   desc: 'Aktualūs balsavimai ir reitingai',                              icon: I.vote,   accent: '#ec4899' },
        { label: 'Albumai',             href: '/albumai',      desc: 'Visi albumai vienoje vietoje',                                  icon: I.album,  accent: '#f97316', soon: true },
        { label: 'Žanrai ir stiliai',   href: '/zanrai',       desc: 'Rokas, hip-hop, popsas, electronic, folk',                      icon: I.genre,  accent: '#a855f7', soon: true },
        { label: 'Apdovanojimai',       href: '/apdovanojimai',desc: 'M.A.M.A., Bravo ir kiti laureatai',                             icon: I.award,  accent: '#eab308', soon: true },
        { label: 'Dienos daina',        href: '/dienos-daina', desc: 'Redakcijos pasirinkimas šiandien',                              icon: I.song,   accent: '#10b981' },
      ]}
    />
  )
}
