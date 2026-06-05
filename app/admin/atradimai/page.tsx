// app/admin/atradimai/page.tsx
// Admin: trūkstami atlikėjai/dainos iš „Muzikos atradimų" + narių pranešimai.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import AtradimaiAdminClient, { type PendingGroup, type Report } from './AtradimaiAdminClient'

export const metadata: Metadata = { title: 'Atradimai — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AtradimaiAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) {
    redirect('/')
  }
  const sb = createAdminClient()

  const { data: pend } = await sb
    .from('discoveries')
    .select('id, artist_name, track_name, embed_type, embed_id, comment_id')
    .eq('thread_id', 128402)
    .eq('resolve_state', 'needs_import')
    .order('artist_name', { ascending: true })

  // Grupuojam pagal artist_name
  const groups = new Map<string, PendingGroup>()
  for (const d of (pend || []) as any[]) {
    const key = d.artist_name || '(be vardo)'
    const g = groups.get(key) || { artist_name: key, count: 0, samples: [] as any[] }
    g.count++
    if (g.samples.length < 3) g.samples.push({ id: d.id, track_name: d.track_name, embed_type: d.embed_type, embed_id: d.embed_id })
    groups.set(key, g)
  }
  const pendingGroups = [...groups.values()].sort((a, b) => b.count - a.count)

  const { data: reps } = await sb
    .from('missing_reports')
    .select('id, kind, name, note, source_url, context, created_at')
    .eq('status', 'new')
    .order('created_at', { ascending: false })

  return <AtradimaiAdminClient pendingGroups={pendingGroups} reports={(reps || []) as Report[]} />
}
