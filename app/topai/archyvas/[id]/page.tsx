import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return {
    title: `Topo archyvas — savaitė #${id} | music.lt`,
  }
}

function formatWeek(start: string) {
  const d = new Date(start + 'T00:00:00')
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = (x: Date) => x.toLocaleDateString('lt-LT', { day: '2-digit', month: '2-digit' })
  return `${fmt(d)} – ${fmt(end)}, ${d.getFullYear()} m.`
}

export default async function ArchiveWeekPage({ params }: Props) {
  const { id } = await params
  const weekId = parseInt(id)
  if (!Number.isFinite(weekId)) notFound()

  const supabase = createAdminClient()
  const { data: week } = await supabase
    .from('top_weeks')
    .select('id, top_type, week_start, is_finalized')
    .eq('id', weekId)
    .maybeSingle()

  if (!week || !week.is_finalized) notFound()

  const { data: entries } = await supabase
    .from('top_entries')
    .select(`
      id, position, prev_position, weeks_in_top, total_votes, peak_position, track_id,
      legacy_track_id, artist_name, title,
      tracks:track_id (
        id, slug, title, cover_url,
        artists:artist_id ( id, slug, name )
      )
    `)
    .eq('week_id', week.id)
    .order('position', { ascending: true })

  const accent = week.top_type === 'lt_top30' ? '#22c55e' : '#f97316'
  const label = week.top_type === 'lt_top30' ? 'LT TOP 30' : 'TOP 40'
  const TOP_SIZE = week.top_type === 'lt_top30' ? 30 : 40

  const main = (entries || []).filter((e: any) => (e.position || 999) <= TOP_SIZE)

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/topai/archyvas" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        ← Visas archyvas
      </Link>
      <div className="mt-3 flex items-baseline gap-3 flex-wrap">
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ background: accent }}
        >
          {label}
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          {formatWeek(week.week_start)}
        </h1>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
        {main.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-muted)] text-sm">
            Šios savaitės topas tuščias.
          </div>
        ) : main.map((e: any, i: number) => {
          const track = Array.isArray(e.tracks) ? e.tracks[0] : e.tracks
          const artist = track?.artists ? (Array.isArray(track.artists) ? track.artists[0] : track.artists) : null
          // Legacy fallback: jei track neimportuotas, rodom raw artist/title iš archyvo.
          const title = track?.title ?? e.title ?? '—'
          const artistName = artist?.name ?? e.artist_name ?? '—'
          const href = track
            ? (artist?.slug ? `/dainos/${artist.slug}-${track.slug}-${track.id}` : `/dainos/${track.slug}-${track.id}`)
            : null
          const cls = `flex items-center gap-3 px-4 py-3 ${i < main.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''}`
          const Inner = (
            <>
              <span
                className="w-8 text-base font-black tabular-nums text-right"
                style={{ color: e.position && e.position <= 3 ? accent : 'var(--text-secondary)' }}
              >
                {e.position}
              </span>
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--bg-elevated)]">
                {track?.cover_url
                  ? <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">♪</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{title}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{artistName}</p>
              </div>
              {e.total_votes ? (
                <span className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
                  {e.total_votes}
                </span>
              ) : null}
            </>
          )
          return href ? (
            <Link key={e.id} href={href} className={`${cls} hover:bg-[var(--bg-hover)] transition-colors`}>
              {Inner}
            </Link>
          ) : (
            <div key={e.id} className={cls}>{Inner}</div>
          )
        })}
      </div>
    </div>
  )
}
