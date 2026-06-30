// app/admin/galerija/page.tsx
//
// Admin valdymas foto galerijai (/galerija): reportažai + fotografų direktorija.
// Workflow: sukurk reportažą → įklijuok Flickr albumo nuorodą (auto-import,
// re-host'inam į mūsų serverį) arba įkelk nuotraukas → priskirk fotografą.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import GalerijaAdminClient, { type AdminReportage, type AdminPhotographer, type AdminVenue } from './GalerijaAdminClient'

export const metadata: Metadata = { title: 'Foto galerija — admin | music.lt' }
export const dynamic = 'force-dynamic'

async function load(): Promise<{ reportages: AdminReportage[]; photographers: AdminPhotographer[]; venues: AdminVenue[] }> {
  try {
    const sb = createAdminClient()
    const [reps, phs, vns] = await Promise.all([
      sb.from('reportages')
        .select('id, slug, title, artist_id, photographer_id, event_name, venue, city, event_date, cover_url, photo_count, is_published, is_featured, published_at, artists:artist_id(name), photographers:photographer_id(name)')
        .order('published_at', { ascending: false }).limit(500),
      sb.from('photographers')
        .select('id, slug, name, role_title, bio, avatar_url, website_url, instagram_url, facebook_url, flickr_url, is_curated, display_order, source')
        .order('is_curated', { ascending: false }).order('display_order', { ascending: true }).order('name', { ascending: true })
        .limit(80),
      sb.from('venues').select('name, city').not('name', 'is', null).order('name', { ascending: true }).limit(2000),
    ])
    // Unikalūs vietų pavadinimai (su miestu)
    const seen = new Set<string>()
    const venues: AdminVenue[] = []
    for (const v of (vns.data || []) as any[]) {
      const key = (v.name || '').trim()
      if (!key || seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      venues.push({ name: key, city: v.city ?? null })
    }
    return { reportages: (reps.data || []) as any[], photographers: (phs.data || []) as any[], venues }
  } catch {
    return { reportages: [], photographers: [], venues: [] }
  }
}

export default async function AdminGalerijaPage() {
  const { reportages, photographers, venues } = await load()
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          📸 Foto galerija
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Reportažai ir fotografai. Sukurk reportažą, įklijuok Flickr albumą (auto-import į mūsų serverį)
          arba įkelk nuotraukas, priskirk fotografą. Rodoma{' '}
          <Link href="/galerija" className="text-[var(--accent-link)]">/galerija</Link>.
        </p>
      </div>
      <GalerijaAdminClient initialReportages={reportages} initialPhotographers={photographers} initialVenues={venues} />
    </div>
  )
}
