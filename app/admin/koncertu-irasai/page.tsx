// app/admin/koncertu-irasai/page.tsx
//
// Admin valdymas „Koncertų įrašams" (/koncertu-irasai).
// Workflow: įklijuok YouTube nuorodą → auto-parse (trukmė, data, vieta, tipas,
// atlikėjas) → patikrink/redaguok → išsaugok. Apačioje — esamų įrašų sąrašas.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import KoncertuIrasaiAdminClient, { type AdminRecording } from './KoncertuIrasaiAdminClient'

export const metadata: Metadata = { title: 'Koncertų įrašai — admin | music.lt' }
export const dynamic = 'force-dynamic'

async function loadRecordings(): Promise<AdminRecording[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('concert_recordings')
      .select('id, slug, youtube_id, title, artist_id, artist_name_cached, duration_seconds, recording_type, venue, city, recorded_on, recorded_year, uploaded_at, view_count, styles, is_published, is_featured, thumbnail_url, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    return (data || []) as AdminRecording[]
  } catch {
    return []
  }
}

export default async function AdminKoncertuIrasaiPage() {
  const recordings = await loadRecordings()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          🎬 Koncertų įrašai
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Pridėk live pasirodymą iš vienos YouTube nuorodos — trukmė, įkėlimo data,
          vieta, koncerto data ir tipas atpažįstami automatiškai. Patikrink ir išsaugok.
          {' '}Rodoma <Link href="/koncertu-irasai" className="text-[var(--accent-link)]">/koncertu-irasai</Link> ir atlikėjo puslapyje.
        </p>
      </div>

      <KoncertuIrasaiAdminClient initialRecordings={recordings} />
    </div>
  )
}
