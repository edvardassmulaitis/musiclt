import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { renderThread } from '../page'

type Props = {
  params: Promise<{ id: string; slug: string }>
  searchParams?: Promise<{ sort?: string }>
}

type ThreadRow = {
  legacy_id: number
  slug: string | null
  source_url: string | null
  kind: string | null
  title: string | null
  post_count: number | null
  pagination_count: number | null
  first_post_at: string | null
  last_post_at: string | null
  like_count: number | null
  artist_id: number | null
}

async function getThread(legacyId: number): Promise<ThreadRow | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('forum_threads')
    .select(
      'legacy_id,slug,source_url,kind,title,post_count,pagination_count,first_post_at,last_post_at,like_count,artist_id',
    )
    .eq('legacy_id', legacyId)
    .maybeSingle()
  return (data as ThreadRow | null) ?? null
}

export default async function SluggedThreadPage({ params, searchParams }: Props) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}
  const legacyId = parseInt(id)
  if (!legacyId) notFound()
  const thread = await getThread(legacyId)
  if (!thread) notFound()
  return renderThread(thread, sp.sort)
}
