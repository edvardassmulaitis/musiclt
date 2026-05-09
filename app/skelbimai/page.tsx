import type { Metadata } from 'next'
import { OverviewHub } from '@/components/OverviewHub'

export const metadata: Metadata = {
  title: 'Skelbimai — music.lt',
  description: 'Muzikos turgus — vinilas, instrumentai, audio įranga, paslaugos',
}

const I = {
  vinyl: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>,
  cd: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="18.36" y1="6" x2="14.83" y2="9.17"/></svg>,
  guitar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15"/><path d="m9 9 5 5L15 9 9 9z"/><path d="m22 2-9 9"/><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12"/><path d="M14 14 9 9"/></svg>,
  speaker: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="6" r="1" fill="currentColor"/></svg>,
  mic: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
  service: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  hero: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h18l-2 13H5L3 3z"/><path d="M16 21a1 1 0 1 0 2 0 1 1 0 0 0-2 0zM7 21a1 1 0 1 0 2 0 1 1 0 0 0-2 0z"/></svg>,
}

export default function SkelbimaiPage() {
  return (
    <OverviewHub
      title="Skelbimai"
      subtitle="Muzikos turgus — pirk, parduok, mainykis. Vinilai, instrumentai, audio įranga ir paslaugos vienoje vietoje."
      accent="#10b981"
      icon={I.hero}
      tiles={[
        { label: 'Vinilas',           href: '/skelbimai',  desc: 'LP, EP, single — nauja ir vintage kolekcija',      icon: I.vinyl,   accent: '#0ea5e9', soon: true, big: true },
        { label: 'CD ir kasetės',     href: '/skelbimai',  desc: 'Albumai, box-set\'ai, kasetinės juostos',          icon: I.cd,      accent: '#06b6d4', soon: true },
        { label: 'Instrumentai',      href: '/skelbimai',  desc: 'Gitaros, klavišai, būgnai, pučiamieji',            icon: I.guitar,  accent: '#f59e0b', soon: true },
        { label: 'Audio įranga',      href: '/skelbimai',  desc: 'Kolonėlės, ausinės, mixer\'iai, monitoriai',       icon: I.speaker, accent: '#a855f7', soon: true },
        { label: 'Studijos įranga',   href: '/skelbimai',  desc: 'Mikrofonai, interface\'ai, akustika, software',    icon: I.mic,     accent: '#ec4899', soon: true },
        { label: 'Paslaugos',         href: '/skelbimai',  desc: 'Įrašymas, mokymai, scenos garso atrenata',         icon: I.service, accent: '#10b981', soon: true },
      ]}
    />
  )
}
