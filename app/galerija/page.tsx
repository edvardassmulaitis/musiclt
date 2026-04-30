import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Foto galerija — music.lt',
  description: 'Renginių ir koncertų foto reportažai',
}

export default function GalleryPage() {
  return (
    <PlaceholderPage
      title="Foto galerija"
      subtitle="Koncertų, festivalių ir backstage akimirkos — tūkstančiai nuotraukų iš Lietuvos muzikos scenos."
      accent="#ec4899"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>
        </svg>
      }
      features={[
        { title: 'Renginių reportažai',   desc: 'Foto albumai iš kiekvieno didesnio koncerto' },
        { title: 'Fotografų profiliai',   desc: 'Geriausi muzikos fotografai vienoje vietoje' },
        { title: 'Užkulisiai',            desc: 'Backstage ir behind-the-scenes akimirkos' },
        { title: 'Senų metų archyvas',    desc: 'Senos nuotraukos iš 90\'ų-2000\'ų scenos' },
      ]}
      exploreLinks={[
        { label: 'Renginiai',    href: '/renginiai' },
        { label: 'Festivaliai',  href: '/festivaliai' },
        { label: 'Atlikėjai',    href: '/atlikejai' },
      ]}
    />
  )
}
