import type { Metadata } from 'next'
import RadarClient from './radar-client'

export const metadata: Metadata = {
  title: 'Verta kelionės — koncertai užsienyje, pasiekiami iš Lietuvos | music.lt',
  description: 'Top atlikėjų turų ir festivalių koncertai užsienyje, į kuriuos patogu nuskristi pigiai arba nuvažiuoti mašina iš Lietuvos. Kiekvienam — apytikslė visos kelionės kaina.',
  alternates: { canonical: '/verta-keliones' },
}

export default function VertaKelionesPage() {
  return <RadarClient />
}
