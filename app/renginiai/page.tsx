import { Metadata } from 'next'
import { getEvents, getFeaturedEvents, getEventCities } from '@/lib/supabase-events'
import EventsClient from './events-client'

export const metadata: Metadata = {
  title: 'Renginiai — Music.lt',
  description: 'Artimiausi koncertai, festivaliai ir muzikos renginiai Lietuvoje',
}

// Renginių katalogas yra nedidelis (~kelios dešimtys aktyvių), todėl visą
// sąrašą paimame vienu kartu ir filtruojame kliento pusėje — tai leidžia
// momentinį, sklandų filtravimą (datos, kainos, stiliaus, LT/užsienio) be
// puslapio perkrovimų. ISR cache 5 min.
export const revalidate = 300

export default async function EventsPage() {
  const [{ events }, featured, cities] = await Promise.all([
    // Naujausi pirma — apims visus aktyvius + neseną archyvą vienu fetch'u.
    getEvents({ showPast: true, order: 'desc', limit: 400 }),
    getFeaturedEvents(4),
    getEventCities(),
  ])

  return (
    <EventsClient
      events={events as any}
      featured={featured as any}
      cities={cities}
    />
  )
}
