// Legacy URL: /diskusijos/tema/{legacy_id} arba /diskusijos/tema/{legacy_id}/{slug}
//
// Po unifikacijos visi forum thread'ai gyvena `discussions` lentelėje su
// legacy_id užfiksuotu importo metu. Šitas route tik resolve'ina senąjį URL'ą
// į modernų /diskusijos/[slug] ir 301-redirect'ina. Pati render logika
// gyvena /diskusijos/[slug]/page.tsx (per CommentsSection).

import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

type Props = {
  params: Promise<{ id: string }>
}

export default async function LegacyThreadRedirect({ params }: Props) {
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
