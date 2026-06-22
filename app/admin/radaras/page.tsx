// app/admin/radaras/page.tsx
//
// Admin valdymas „Naujų atlikėjų radarui" (/nauji-atlikejai).
// Hibridas: auto kandidatai (lib/radaras.ts) + rankinis override per radar_status.
// Server fetch'as → perduoda pradinius sąrašus klientiniam RadarAdminClient.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getEmergingArtists } from '@/lib/radaras'
import RadarAdminClient, { type AdminArtist } from './RadarAdminClient'
import RadarSubmissions, { type Submission } from './RadarSubmissions'

export const metadata: Metadata = { title: 'Radaras — admin | music.lt' }
export const dynamic = 'force-dynamic'

const COLS = 'id, name, slug, country, cover_image_url, legacy_likes, radar_status, radar_blurb, radar_sort'

async function byStatus(status: string): Promise<AdminArtist[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artists')
      .select(COLS)
      .eq('radar_status', status)
      .order('radar_sort', { ascending: false })
      .order('name', { ascending: true })
    return (data || []) as AdminArtist[]
  } catch {
    return []
  }
}

async function pendingSubmissions(): Promise<Submission[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('radar_submissions')
      .select('id, artist_name, contact_email, links, genre, city, bio, message, created_at, ip')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)
    return (data || []) as Submission[]
  } catch {
    return []
  }
}

export default async function AdminRadarPage() {
  const [featured, included, excluded, emerging, submissions] = await Promise.all([
    byStatus('featured'),
    byStatus('included'),
    byStatus('excluded'),
    getEmergingArtists(40, true),   // foreignAuto=true — kandidatuose rodom ir užsienio auto
    pendingSubmissions(),
  ])

  // Auto kandidatai = emerging be tų, kurie jau turi override.
  const overridden = new Set([...featured, ...included, ...excluded].map((a) => a.id))
  const candidates: AdminArtist[] = emerging
    .filter((a) => !overridden.has(a.id))
    .map((a) => ({
      id: a.id, name: a.name, slug: a.slug, country: a.country,
      cover_image_url: a.cover_image_url, legacy_likes: a.legacy_likes,
      radar_status: null, radar_blurb: a.radar_blurb, radar_sort: 0,
      latest_title: a.latest_title, genres: a.genres,
    }))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          📡 Naujų atlikėjų radaras
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Valdyk, kas rodoma <Link href="/nauji-atlikejai" className="text-[var(--accent-link)]">/nauji-atlikejai</Link>.
          {' '}<b>Featured</b> = spotlight viršuje · <b>Įtraukti</b> = priverstinai tinklelyje · <b>Nuimti</b> = grąžinti algoritmui.
          {' '}Senų atlikėjų algoritmas nebesiūlo automatiškai (pirmas YT įkėlimas turi būti ≤1 m.).
        </p>
      </div>

      <RadarSubmissions initial={submissions} />

      <div className="my-6 border-t border-[var(--border-subtle)]" />

      <RadarAdminClient
        initialFeatured={featured}
        initialIncluded={included}
        initialExcluded={excluded}
        initialCandidates={candidates}
      />
    </div>
  )
}
