import type { Metadata } from 'next'
import { PlaceholderPage } from '@/components/PlaceholderPage'

export const metadata: Metadata = {
  title: 'Verta kelionės — koncertai užsienyje | music.lt',
  description: 'Atrinkti top atlikėjų turų koncertai užsienyje, į kuriuos patogu nuskristi pigiai arba nuvažiuoti iš Lietuvos.',
}

export default function VertaKelionesPage() {
  return (
    <PlaceholderPage
      title="Verta kelionės"
      subtitle="Atrinkti top atlikėjų turų koncertai užsienyje, į kuriuos patogu nuskristi pigiai arba nuvažiuoti iš Lietuvos."
      accent="#10b981"
      icon={
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
        </svg>
      }
      features={[
        { title: 'Pasiekiama pigiu skrydžiu', desc: 'Koncertai miestuose, kur skrenda tiesioginiai pigūs skrydžiai iš Vilniaus, Kauno ar Rygos' },
        { title: 'Netoli nuvažiuoti automobiliu', desc: 'Ryga, Talinas, Varšuva, Gdanskas — pasiekiami per kelias valandas' },
        { title: 'Top atlikėjų turai', desc: 'Didžiausi vardai, kurie į Lietuvą neatvyksta — pamatyk juos netoliese' },
        { title: 'Kelionės patarimai', desc: 'Bilietai, nakvynė ir logistika vienoje vietoje' },
      ]}
      exploreLinks={[
        { label: 'Koncertai Lietuvoje', href: '/koncertai' },
        { label: 'Festivaliai', href: '/festivaliai' },
        { label: 'Atlikėjai', href: '/atlikejai' },
      ]}
    />
  )
}
