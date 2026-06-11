// app/lt/daina/[slug]/[id]/page.tsx
//
// LEGACY URL — redirect'ina į kanoninį /dainos/{artist-slug}-{track-slug}-{id}.
//
// 2026-06-11: anksčiau čia gyveno PILNAS track puslapio dublikatas su savo
// (sequential, lėtais) queries — jis atsiliko nuo /dainos versijos ir laužė
// build'ą keičiantis TrackPageClient props'ams. Į šį route'ą vis dar veda
// likę legacy link'ai (profilio kortelės, boombox, senų diskusijų body
// tekstai), todėl route'as paliktas kaip plonas redirect sluoksnis.
//
// PASTABA: track-page-client.tsx šiame folderyje LIEKA — jį importuoja
// kanoninis /dainos/[slugId]/page.tsx.
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

export const revalidate = 3600

export default async function LegacyTrackPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { id } = await params
  const trackId = parseInt(id, 10)
  if (isNaN(trackId)) notFound()

  const supabase = createAdminClient()
  const { data: track } = await supabase
    .from('tracks')
    .select('id, slug, artist_id, artists:artist_id(slug)')
    .eq('id', trackId)
    .single()

  if (!track) notFound()
  const artistSlug = (track as any).artists?.slug
  if (!artistSlug) notFound()

  redirect(`/dainos/${artistSlug}-${track.slug}-${track.id}`)
}
