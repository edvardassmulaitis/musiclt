import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Juodraštis',
  voting_open: 'Balsavimas atidarytas',
  voting_closed: 'Balsavimas uždarytas',
  archived: 'Archyvas',
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ channel: string }>
}) {
  const { channel: slug } = await params
  const supabase = createAdminClient()

  const { data: channel } = await supabase
    .from('voting_channels')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!channel) return notFound()

  const { data: editions } = await supabase
    .from('voting_editions')
    .select('*')
    .eq('channel_id', channel.id)
    .neq('status', 'draft')
    .order('year', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-4 text-sm">
        <Link href="/balsavimai" className="text-orange-600 hover:underline">← Visi balsavimai</Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        {channel.logo_url && <img src={channel.logo_url} alt="" className="w-16 h-16 rounded object-cover" />}
        <div>
          <h1 className="text-3xl font-bold">{channel.name}</h1>
          {channel.description && <p className="text-gray-500">{channel.description}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(editions || []).map(e => (
          <Link
            key={e.id}
            href={`/balsavimai/${channel.slug}/${e.slug}`}
            className="block p-4 border border-[var(--border-default)] rounded-lg hover:border-orange-500 bg-[var(--bg-hover)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold">{e.name}</div>
                {e.year && <div className="text-sm text-gray-500">{e.year}</div>}
              </div>
              <div className={`text-xs px-2 py-1 rounded ${
                e.status === 'voting_open'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {STATUS_LABELS[e.status] || e.status}
              </div>
            </div>
            {e.description && <p className="text-sm text-gray-600 mt-2">{e.description}</p>}
          </Link>
        ))}
        {(!editions || editions.length === 0) && (
          <div className="col-span-full text-gray-400 italic">Leidimų nėra.</div>
        )}
      </div>
    </div>
  )
}
