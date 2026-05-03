// Legacy URL su slug: /diskusijos/tema/{legacy_id}/{slug}/
//
// Po unifikacijos resolve'inam pagal legacy_id ir redirect'inam į modernią
// /diskusijos/[slug]. Slug iš URL ignoruojamas — `discussions.slug` yra
// canonical (gali skirtis nuo pradinio music.lt slug'o).

import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

type Props = {
  params: Promise<{ id: string; slug: string }>
}

export default async function LegacyThreadSlugRedirect({ params }: Props) {
  const { id } = await params
  const legacyId = Number(id)
  if (!Number.isFinite(legacyId) || legacyId <= 0) notFound()

  const sb = createAdminClient()
  const { data } = await sb
    .from('discussions')
    .select('slug')
    .eq('legacy_id', legacyId)
    .eq('is_deleted', false)
    .maybeSingle()

  const slug = (data as { slug?: string } | null)?.slug
  if (!slug) notFound()

  redirect(`/diskusijos/${slug}`)
}
