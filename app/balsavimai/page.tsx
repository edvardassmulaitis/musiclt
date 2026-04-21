import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function BalsavimaiList() {
  const supabase = createAdminClient()
  const { data: channels } = await supabase
    .from('voting_channels')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')

  // Imam aktyvius leidimus (pirmą / naujausią pagal year)
  const ids = (channels || []).map(c => c.id)
  const { data: editions } = ids.length
    ? await supabase
        .from('voting_editions')
        .select('id, channel_id, slug, name, year, status, cover_image_url')
        .in('channel_id', ids)
        .in('status', ['voting_open', 'voting_closed', 'archived'])
        .order('year', { ascending: false })
    : { data: [] as any[] }

  const editionsByChannel = new Map<number, any[]>()
  for (const e of editions || []) {
    if (!editionsByChannel.has(e.channel_id)) editionsByChannel.set(e.channel_id, [])
    editionsByChannel.get(e.channel_id)!.push(e)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Balsavimai ir rinkimai</h1>
      <p className="text-gray-500 mb-8">Eurovizijos, MAMA ir kiti specialūs muzikos rinkimai.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(channels || []).map(c => {
          const latest = editionsByChannel.get(c.id)?.[0]
          const openEdition = editionsByChannel.get(c.id)?.find(e => e.status === 'voting_open')
          return (
            <Link
              key={c.id}
              href={`/balsavimai/${c.slug}`}
              className="block bg-[var(--bg-hover)] rounded-lg overflow-hidden border border-[var(--border-default)] hover:border-orange-500 transition"
            >
              {(latest?.cover_image_url || c.cover_image_url) && (
                <div
                  className="h-32 bg-cover bg-center"
                  style={{ backgroundImage: `url(${latest?.cover_image_url || c.cover_image_url})` }}
                />
              )}
              <div className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  {c.logo_url && <img src={c.logo_url} alt="" className="w-10 h-10 rounded object-cover" />}
                  <div>
                    <h2 className="font-bold">{c.name}</h2>
                    {latest && <div className="text-xs text-gray-500">Naujausias: {latest.name}</div>}
                  </div>
                </div>
                {c.description && <p className="text-sm text-gray-600 mb-3">{c.description}</p>}
                {openEdition && (
                  <div className="inline-block text-xs bg-orange-500 text-white px-2 py-1 rounded">
                    Balsavimas atidarytas
                  </div>
                )}
              </div>
            </Link>
          )
        })}
        {(!channels || channels.length === 0) && (
          <div className="col-span-full text-gray-400 italic">Šiuo metu nėra aktyvių balsavimų.</div>
        )}
      </div>
    </div>
  )
}
