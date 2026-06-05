// app/admin/atradimai/page.tsx
// Admin: trūkstami + susieti atradimai (su komentaro kontekstu) + narių pranešimai.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import AtradimaiAdminClient, { type Sample, type PendingGroup, type LinkedGroup, type Report } from './AtradimaiAdminClient'

export const metadata: Metadata = { title: 'Atradimai — admin | music.lt' }
export const dynamic = 'force-dynamic'

const SEL = 'id, artist_name, track_name, embed_type, embed_id, comment_id, body, artist_id, comments:comment_id(body), artists:artist_id(name, slug)'

function sample(d: any) {
  return {
    id: d.id, track_name: d.track_name, embed_type: d.embed_type, embed_id: d.embed_id,
    body: (d.comments?.body ?? d.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
  }
}

export default async function AtradimaiAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) redirect('/')
  const sb = createAdminClient()

  const { data: pend } = await sb.from('discoveries').select(SEL)
    .or('thread_id.eq.128402,source.eq.user').eq('resolve_state', 'needs_import').order('artist_name', { ascending: true })

  const pg = new Map<string, PendingGroup>()
  for (const d of (pend || []) as any[]) {
    const key = d.artist_name || '(be vardo)'
    const g = pg.get(key) || { artist_name: key, count: 0, samples: [] as Sample[] }
    g.count++; if (g.samples.length < 8) g.samples.push(sample(d))
    pg.set(key, g)
  }
  const pendingGroups = [...pg.values()].sort((a, b) => b.count - a.count)

  const { data: linked } = await sb.from('discoveries').select(SEL)
    .or('thread_id.eq.128402,source.eq.user').not('artist_id', 'is', null).order('artist_id', { ascending: true })

  const lg = new Map<number, LinkedGroup>()
  for (const d of (linked || []) as any[]) {
    const key = d.artist_id as number
    const g = lg.get(key) || { artist_id: key, db_name: d.artists?.name || '?', slug: d.artists?.slug || null, raw_name: d.artist_name || '', count: 0, samples: [] as Sample[] }
    g.count++; if (g.samples.length < 8) g.samples.push(sample(d))
    lg.set(key, g)
  }
  const linkedGroups = [...lg.values()].sort((a, b) => b.count - a.count)

  const { data: reps } = await sb.from('missing_reports')
    .select('id, kind, name, note, source_url, context, created_at').eq('status', 'new').order('created_at', { ascending: false })

  return <AtradimaiAdminClient pendingGroups={pendingGroups} linkedGroups={linkedGroups} reports={(reps || []) as Report[]} />
}
