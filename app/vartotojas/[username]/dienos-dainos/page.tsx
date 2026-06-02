// app/vartotojas/[username]/dienos-dainos/page.tsx
//
// Pilnas user'io „Dienos dainos" archyvas = muzikinis dienoraštis (paginated).
// V12 (2026-06-02): perdaryta iš senos legacy dark temos (#080c12) į homepage
// CSS-kintamųjų temą; didesni vizualai — DailyPickCard grid'as (toks pat kaip
// profilio juostoje ir homepage); userio komentarai matomi kiekvienoje
// kortelėje. einaras13 atveju — 2000+ įrašų, t.y. dešimtys puslapių.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getProfileByUsername } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import { DailyPickCard } from '@/components/profile/DailyPicksCards'

type Props = {
  params: Promise<{ username: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 48

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  return {
    title: `${username} muzikinis dienoraštis — music.lt`,
    description: `${username} kasdienės dainos ir mintys music.lt platformoje`,
    alternates: { canonical: `/@${username}/dienos-dainos` },
  }
}

export default async function UserDailyPicksPage({ params, searchParams }: Props) {
  const { username } = await params
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)

  const profile: any = await getProfileByUsername(username)
  if (!profile || !profile.is_public) notFound()

  const sb = createAdminClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data, count } = await sb
    .from('daily_song_picks')
    .select(`
      id, picked_on, comment, like_count, legacy_track_id, track_id,
      tracks:track_id(id, slug, title, video_url, cover_url, like_count, artist_id, artists:artist_id(id, slug, name, cover_image_url))
    `, { count: 'exact' })
    .eq('author_id', profile.id)
    .order('picked_on', { ascending: false })
    .range(from, to)

  // Normalizuojam tracks į objektą (DailyPickCard tikisi pick.tracks objekto)
  const picks = ((data || []) as any[]).map((p) => ({
    ...p,
    tracks: Array.isArray(p.tracks) ? p.tracks[0] || null : p.tracks,
  }))
  const total = count || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pendingOnPage = picks.filter((p) => !p.track_id).length

  // Sugrupuojam pagal metus
  const grouped: { year: number; picks: any[] }[] = []
  for (const p of picks) {
    const yr = new Date(p.picked_on).getFullYear()
    const last = grouped[grouped.length - 1]
    if (last && last.year === yr) last.picks.push(p)
    else grouped.push({ year: yr, picks: [p] })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/@${username}`} className="text-xs font-bold transition hover:opacity-80"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
            ← Atgal į profilį
          </Link>
          <h1 className="font-black tracking-[-0.03em] mt-2"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.6rem, 4vw, 2.4rem)' }}>
            {profile.full_name || profile.username} · muzikinis dienoraštis
          </h1>
          <p className="text-sm mt-1" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
            {total.toLocaleString('lt-LT')} kasdienių dainų
            {pendingOnPage > 0 && <> · šiame puslapyje {pendingOnPage} dar neimportuotos</>}
          </p>
        </div>

        {/* Picks grouped by year */}
        <div className="space-y-10">
          {grouped.map((group) => (
            <section key={group.year}>
              <h2 className="text-xs font-extrabold uppercase tracking-[0.15em] mb-4"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-faint)' }}>
                {group.year}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {group.picks.map((p) => <DailyPickCard key={p.id} pick={p} />)}
              </div>
            </section>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-12 text-sm" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {page > 1 && (
              <Link href={`/@${username}/dienos-dainos${page > 2 ? `?page=${page - 1}` : ''}`}
                    className="px-4 py-2 rounded-lg font-bold transition hover:-translate-y-0.5"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                ← Anksčiau
              </Link>
            )}
            <span className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={`/@${username}/dienos-dainos?page=${page + 1}`}
                    className="px-4 py-2 rounded-lg font-bold transition hover:-translate-y-0.5"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                Vėliau →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
