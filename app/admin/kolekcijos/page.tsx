// app/admin/kolekcijos/page.tsx
//
// Admin: teminių kolekcijų valdymas (collections lentelė + collection_tracks).
// Dainų kolekcijos KURUOJAMOS (track picker + AI suggest); albumų kolekcijos
// UŽKLAUSOMOS (žanras / substilis / šalis — turinį generuoja DB automatiškai).

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'
import { getGenreCounts } from '@/lib/muzika-hub'
import KolekcijosAdminClient, { type AdminCollection } from './KolekcijosAdminClient'

export const metadata: Metadata = { title: 'Kolekcijos — admin | music.lt' }
export const dynamic = 'force-dynamic'

async function loadCollections(): Promise<AdminCollection[]> {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('collections')
      .select('id, slug, kind, title, emoji, meta_title, description, intro, grp, genre_name, scope, substyle_slug, sort, is_active, created_at')
      .order('kind', { ascending: true })
      .order('sort', { ascending: true })
    return (data || []) as AdminCollection[]
  } catch { return [] }
}

async function loadGenreNames(): Promise<string[]> {
  try {
    const genres = await getGenreCounts()
    return genres.map((g) => g.name)
  } catch { return [] }
}

export default async function AdminKolekcijosPage() {
  const [collections, genreNames] = await Promise.all([loadCollections(), loadGenreNames()])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          🎼 Kolekcijos
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Teminės dainų ir albumų kolekcijos, rodomos <Link href="/muzika" className="text-[var(--accent-link)]">/muzika</Link> hub'e.
          Dainų kolekcijas pildyk rankiniu būdu arba leisk AI pasiūlyti dainas — patvirtini ✓ pats.
          Albumų kolekcijos užsipildo automatiškai pagal žanrą.
        </p>
      </div>

      <KolekcijosAdminClient initialCollections={collections} genreNames={genreNames} />
    </div>
  )
}
