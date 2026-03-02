import { Metadata } from 'next'
import { getEvents, getFeaturedEvents, getEventCities } from '@/lib/supabase-events'
import EventsClient from './events-client'

export const metadata: Metadata = {
  title: 'Renginiai — Music.lt',
  description: 'Artimiausi koncertai, festivaliai ir muzikos renginiai Lietuvoje',
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ city?: string; period?: string; showPast?: string }> }) {
  const sp = await searchParams
  const [{ events, total }, featured, cities] = await Promise.all([
    getEvents({
      city: sp.city,
      period: (sp.period as 'week' | 'month' | 'all') || undefined,
      showPast: sp.showPast === 'true',
      limit: 20,
    }),
    getFeaturedEvents(3),
    getEventCities(),
  ])

  return (
    <EventsClient
      events={events}
      featured={featured}
      cities={cities}
      total={total}
      initialCity={sp.city || 'Visi'}
      initialPeriod={sp.period || 'all'}
      showPast={sp.showPast === 'true'}
    />
  )
}
