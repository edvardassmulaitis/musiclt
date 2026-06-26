import type { Metadata } from 'next'
import RadarClient from './radar-client'
import { getVertaKelionesData } from '@/lib/verta-keliones-db'

export const metadata: Metadata = {
  title: 'Verta kelionės — koncertai užsienyje, pasiekiami iš Lietuvos | music.lt',
  description: 'Top atlikėjų turų ir festivalių koncertai užsienyje, į kuriuos patogu nuskristi pigiai arba nuvažiuoti mašina iš Lietuvos. Kiekvienam — apytikslė visos kelionės kaina.',
  alternates: { canonical: '/verta-keliones' },
}

// ISR 5 min — duomenys iš DB (travel_destinations + events kur is_abroad), fallback į seed.
export const revalidate = 300

export default async function VertaKelionesPage() {
  const { concerts, destinations } = await getVertaKelionesData()
  return <RadarClient concerts={concerts} destinations={destinations} />
}
