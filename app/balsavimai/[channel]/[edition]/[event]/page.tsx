import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { enrichParticipants } from '@/lib/supabase-voting'
import VotingClient from './voting-client'

export const dynamic = 'force-dynamic'

export default async function EventPage({
  params,
}: {
  params: Promise<{ channel: string; edition: string; event: string }>
}) {
  const { channel: channelSlug, edition: editionSlug, event: eventSlug } = await params
  const supabase = createAdminClient()

  const { data: channel } = await supabase
    .from('voting_channels').select('*').eq('slug', channelSlug).eq('is_active', true).maybeSingle()
  if (!channel) return notFound()

  const { data: edition } = await supabase
    .from('voting_editions').select('*').eq('channel_id', channel.id).eq('slug', editionSlug).maybeSingle()
  if (!edition || edition.status === 'draft') return notFound()

  const { data: event } = await supabase
    .from('voting_events').select('*').eq('edition_id', edition.id).eq('slug', eventSlug).maybeSingle()
  if (!event || event.status === 'draft') return notFound()

  const { data: participants } = await supabase
    .from('voting_participants')
    .select('*')
    .eq('event_id', event.id)
    .eq('is_disqualified', false)
    .order('sort_order')

  const enriched = await enrichParticipants(participants || [])

  // Nusprendžiam ar rezultatai matomi
  const now = new Date()
  const isClosed =
    event.status === 'voting_closed' ||
    event.status === 'archived' ||
    (event.vote_close && new Date(event.vote_close) < now)

  let showResults = true
  if (event.results_visible === 'never') showResults = false
  if (event.results_visible === 'after_close' && !isClosed) showResults = false

  const participantsForClient = enriched.map(p => ({
    ...p,
    vote_count: showResults ? p.vote_count : undefined,
    avg_rating: showResults ? p.avg_rating : undefined,
    top_n_score: showResults ? p.top_n_score : undefined,
  }))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-4 text-sm">
        <Link href="/balsavimai" className="text-orange-600 hover:underline">Visi</Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link href={`/balsavimai/${channel.slug}`} className="text-orange-600 hover:underline">{channel.name}</Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link href={`/balsavimai/${channel.slug}/${edition.slug}`} className="text-orange-600 hover:underline">
          {edition.name}
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">{event.name}</h1>
      {event.description && <p className="text-gray-500 mb-6">{event.description}</p>}

      <VotingClient
        event={event}
        participants={participantsForClient}
        showResults={showResults}
      />
    </div>
  )
}
