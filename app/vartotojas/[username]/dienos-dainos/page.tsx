// app/vartotojas/[username]/dienos-dainos/page.tsx
//
// Pilnas user'io „Dienos dainos" archyvas (paginated). Default page'as
// rodo paskutines 50; ?page=2..N — istorinę gilumą.
//
// einaras13 atveju — 1000 įrašų, t.y. 20 puslapių.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getProfileByUsername } from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'

type Props = {
  params: Promise<{ username: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 50

export async function generateMetadata({ params }: Props) {
  const { username } = await params
  return {
    title: `${username} dienos dainos — music.lt`,
    description: `${username} pasirinktos kasdienės dainos music.lt platformoje`,
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
      tracks:track_id(id, slug, title, artist_id, artists:artist_id(id, slug, name, cover_image_url))
    `, { count: 'exact' })
    .eq('author_id', profile.id)
    .order('picked_on', { ascending: false })
    .range(from, to)

  const picks = (data || []) as any[]
  const total = count || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Sugrupuojam pagal metus
  const grouped: { year: number; picks: any[] }[] = []
  for (const p of picks) {
    const yr = new Date(p.picked_on).getFullYear()
    const last = grouped[grouped.length - 1]
    if (last && last.year === yr) {
      last.picks.push(p)
    } else {
      grouped.push({ year: yr, picks: [p] })
    }
  }

  // Pending suvestinė (kiek track'ų neresolved)
  const resolvedCount = picks.filter((p) => p.track_id).length
  const pendingOnPage = picks.length - resolvedCount

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/vartotojas/${username}`} className="text-xs text-[#5e7290] hover:text-[#b0bdd4] transition">
            ← Atgal į profilį
          </Link>
          <h1 className="text-3xl font-extrabold mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {profile.full_name || profile.username} · dienos dainos
          </h1>
          <p className="text-sm text-[#5e7290] mt-1">
            {total.toLocaleString('lt-LT')} pasirinkimų
            {pendingOnPage > 0 && <> · šiame puslapyje {pendingOnPage} dainų dar neimportuotos</>}
          </p>
        </div>

        {/* Picks grouped by year */}
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.year}>
              <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-[#334058] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {group.year}
              </h2>
              <div className="space-y-2">
                {group.picks.map((p) => <DailyPickRow key={p.id} pick={p} />)}
              </div>
            </section>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-12 text-sm">
            {page > 1 && (
              <Link
                href={`/vartotojas/${username}/dienos-dainos${page > 2 ? `?page=${page - 1}` : ''}`}
                className="px-4 py-2 rounded-lg bg-white/[.03] border border-white/[.06] hover:bg-white/[.07] transition"
              >
                ← Anksčiau
              </Link>
            )}
            <span className="px-4 py-2 text-[#5e7290]">{page} / {totalPages}</span>
            {page < totalPages && (
              <Link
                href={`/vartotojas/${username}/dienos-dainos?page=${page + 1}`}
                className="px-4 py-2 rounded-lg bg-white/[.03] border border-white/[.06] hover:bg-white/[.07] transition"
              >
                Vėliau →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DailyPickRow({ pick }: { pick: any }) {
  const tracks = Array.isArray(pick.tracks) ? pick.tracks[0] : pick.tracks
  const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
  const dateStr = new Date(pick.picked_on).toLocaleDateString('lt-LT', {
    month: 'long', day: 'numeric',
  })
  const trackKnown = !!tracks

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-white/[.04] bg-white/[.02]">
      <div className="flex-shrink-0 w-16 pt-1">
        <p className="text-[10px] font-bold uppercase text-[#5e7290] tracking-wider">{dateStr}</p>
      </div>
      <div className="flex-1 min-w-0">
        {trackKnown ? (
          <Link href={`/atlikejai/${artist?.slug}`} className="block group">
            <div className="flex items-center gap-3">
              {artist?.cover_image_url ? (
                <img src={artist.cover_image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-[#111822] flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate group-hover:text-[#34d399] transition">{tracks.title}</p>
                <p className="text-xs text-[#5e7290] truncate">{artist?.name}</p>
              </div>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#111822]/50 flex items-center justify-center text-[#334058] text-xs flex-shrink-0">♪</div>
            <div>
              <p className="text-sm text-[#5e7290] italic">Daina dar neimportuota</p>
              <p className="text-[10px] text-[#334058]">music.lt #{pick.legacy_track_id}</p>
            </div>
          </div>
        )}
        {pick.comment && (
          <p className="text-xs text-[#b0bdd4] mt-1.5 italic line-clamp-2">„{pick.comment}"</p>
        )}
      </div>
      {pick.like_count > 0 && (
        <div className="flex-shrink-0 text-xs text-[#5e7290] pt-1">
          ♥ {pick.like_count}
        </div>
      )}
    </div>
  )
}
