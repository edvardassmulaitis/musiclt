import { Metadata } from 'next'
import { getEvents, getEventCities } from '@/lib/supabase-events'
import EventsClient from '../renginiai/events-client'

export const metadata: Metadata = {
  title: 'Koncertai Lietuvoje – artimiausi muzikos renginiai | music.lt',
  description: 'Artimiausi koncertai Lietuvoje: atlikėjų pasirodymai, turai, festivaliai ir muzikos renginiai Vilniuje, Kaune, Klaipėdoje, Palangoje ir kituose miestuose.',
  alternates: { canonical: '/koncertai' },
}

// Koncertų katalogas nedidelis (~kelios dešimtys aktyvių) — visą sąrašą paimame
// vienu kartu ir filtruojame kliento pusėje (momentinis filtravimas). ISR 5 min.
export const revalidate = 300

export default async function KoncertaiPage() {
  const [{ events }, cities] = await Promise.all([
    getEvents({ showPast: true, order: 'desc', limit: 400 }),
    getEventCities(),
  ])

  return <EventsClient events={events as any} cities={cities} />
}
