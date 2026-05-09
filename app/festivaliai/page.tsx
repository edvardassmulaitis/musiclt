import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Festivaliai — music.lt',
  description: 'Lietuvos ir užsienio muzikos festivaliai',
}

export default function FestivalsPage() {
  return (
    <PlaceholderPage
      title="Festivaliai"
      subtitle="Granatos, Bliuzo naktys, Devilstone, Karklė, Žalgirio nakties festivaliai — line-up'ai, datos, bilietai ir nuotaikos."
      accent="#06b6d4"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21V8l9-5 9 5v13"/><path d="M9 21V12h6v9"/><circle cx="12" cy="9" r="1.5"/>
        </svg>
      }
      features={[
        { title: 'Šios vasaros festivaliai',  desc: 'Datos, vietos, headliner\'iai' },
        { title: 'Pilni line-up\'ai',         desc: 'Visi atlikėjai pagal sceną ir laiką' },
        { title: 'Bilietų info',              desc: 'Kainos, early-bird, kur pirkti' },
        { title: 'Praėjusių festivalių foto', desc: 'Galerijos ir prisiminimai' },
      ]}
      exploreLinks={[
        { label: 'Visi renginiai', href: '/renginiai' },
        { label: 'Galerija',       href: '/galerija' },
        { label: 'Atlikėjai',      href: '/atlikejai' },
      ]}
    />
  )
}
