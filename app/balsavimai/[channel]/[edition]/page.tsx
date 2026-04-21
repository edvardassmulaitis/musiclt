import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const VOTING_TYPE_LABELS: Record<string, string> = {
  single: 'Vienas balsas',
  top_n: 'TOP-N rinkimas',
  rating: 'Reitingas',
}

const STATUS_LABELS: Record<string, string> = {
  voting_open: 'Balsavimas atidarytas',
  voting_closed: 'Balsavimas baigtas',
  archived: 'Archyvas',
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ channel: string; edition: string }>
}) {
  const { channel: channelSlug, edition: editionSlug } = await params
  const supabase = createAdminClient()

  const { data: channel } = await supabase
    .from('voting_channels')
    .select('*')
    .eq('slug', channelSlug)
    .eq('is_active', true)
    .maybeSingle()
  if (!channel) return notFound()

  const { data: edition } = await supabase
    .from('voting_editions')
    .select('*')
    .eq('channel_id', channel.id)
    .eq('slug', editionSlug)
    .neq('status', 'draft')
    .maybeSingle()
  if (!edition) return notFound()

  const { data: events } = await supabase
    .from('voting_events')
    .select('*')
    .eq('edition_id', edition.id)
    .neq('status', 'draft')
    .order('sort_order')

  // Jei tik vienas event — redirect (conceptual); paprasčiau tiesiog parodom jį čia
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-4 text-sm">
        <Link href="/balsavimai" className="text-orange-600 hover:underline">Visi</Link>
        <span className="mx-2 text-gray-400">/</span>
        <Link href={`/balsavimai/${channel.slug}`} className="text-orange-600 hover:underline">{channel.name}</Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">{edition.name}</h1>
        {edition.description && <p className="text-gray-500 mt-2">{edition.description}</p>}
        <div className="text-xs text-gray-400 mt-2">{STATUS_LABELS[edition.status] || edition.status}</div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Rinkimai</h2>
        {(events || []).map(e => (
          <Link
            key={e.id}
            href={`/balsavimai/${channel.slug}/${edition.slug}/${e.slug}`}
            className="block p-4 border border-[var(--border-default)] rounded hover:border-orange-500 bg-[var(--bg-hover)]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold">{e.name}</div>
                <div className="text-xs text-gray-500">
                  {VOTING_TYPE_LABELS[e.voting_type]}{e.voting_top_n ? ` · TOP-${e.voting_top_n}` : ''}
                </div>
                {e.description && <p className="text-sm text-gray-600 mt-1">{e.description}</p>}
              </div>
              <div className={`text-xs px-2 py-1 rounded ${
                e.status === 'voting_open' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {STATUS_LABELS[e.status] || e.status}
              </div>
            </div>
          </Link>
        ))}
        {(!events || events.length === 0) && (
          <div className="text-gray-400 italic">Rinkimų nėra.</div>
        )}
      </div>
    </div>
  )
}
