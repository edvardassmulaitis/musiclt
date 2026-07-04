// app/admin/users-migration/page.tsx
//
// Narių UGC migracijos dashboard — top 50 sort by karma_points desc.
// Kiekvienam stulpeliai per fazę: profile / mood / styles / artists /
// likes / friends / blog (diary+creation+translate+topas) / daily picks /
// comments. Žalia/geltona/raudona pagal completeness.
//
// Click on row → /admin/users-migration/[username] (per-user detail).

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase'

type Row = {
  profile_id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  is_claimed: boolean
  provider: string | null
  legacy_user_id: number | null
  legacy_karma_points: number | null
  legacy_login_count: number | null
  legacy_message_count: number | null
  joined_legacy_at: string | null
  legacy_liked_artist_count: number | null
  legacy_liked_album_count: number | null
  legacy_liked_track_count: number | null
  mood_set: number
  diary_count: number
  creation_count: number
  translate_count: number
  topas_count: number
  daily_picks_count: number
  daily_picks_resolved: number
  friends_count: number
  comments_count: number
  styles_count: number
  favorite_artists_count: number
  likes_artist_resolved: number
  likes_artist_pending: number
  likes_album_resolved: number
  likes_album_pending: number
  likes_track_resolved: number
  likes_track_pending: number
  phases_touched: number
}

export default async function UsersMigrationPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; sort?: string }>
}) {
  const { limit: limitStr, sort } = await searchParams
  const limit = Math.min(parseInt(limitStr || '50', 10) || 50, 500)
  const sortKey = sort || 'karma'

  const sb = createAdminClient()
  let query = sb.from('v_user_migration_status').select('*').limit(limit)
  if (sortKey === 'karma') {
    query = query.order('legacy_karma_points', { ascending: false, nullsFirst: false })
  } else if (sortKey === 'phases') {
    query = query.order('phases_touched', { ascending: false }).order('legacy_karma_points', { ascending: false, nullsFirst: false })
  } else if (sortKey === 'likes') {
    // Use the cached counts on profile — pending+resolved
    query = query.order('legacy_liked_track_count', { ascending: false, nullsFirst: false })
  } else if (sortKey === 'messages') {
    query = query.order('legacy_message_count', { ascending: false, nullsFirst: false })
  }
  const { data: rows, error } = await query
  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Narių migracija</h1>
        <p className="text-red-500">DB klaida: {error.message}</p>
        <p className="text-sm text-zinc-400 mt-2">Patikrink, ar migracija <code>20260521d_user_migration_view.sql</code> jau aplikuota.</p>
      </div>
    )
  }

  const data = (rows || []) as Row[]

  // Summary
  const total = data.length
  const claimedCount = data.filter((r) => r.is_claimed).length
  const fullyMigrated = data.filter((r) => r.phases_touched >= 5).length
  const totalLikesPending = data.reduce(
    (acc, r) => acc + r.likes_artist_pending + r.likes_album_pending + r.likes_track_pending,
    0,
  )

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Narių migracija
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
            UGC migracijos progresas legacy nariams. Rikiavimas pagal karma_points.
          </p>
        </div>
        <Link href="/admin" className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
          ← /admin
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <SummaryCard label="Top sąraše" value={total.toLocaleString('lt-LT')} />
        <SummaryCard label="≥5 fazes pasiektos" value={`${fullyMigrated} / ${total}`} />
        <SummaryCard label="Claim'inti accountai" value={`${claimedCount} / ${total}`} />
        <SummaryCard label="Pending likes (visi)" value={totalLikesPending.toLocaleString('lt-LT')} />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <SortPill label="Karma" active={sortKey === 'karma'} href="?sort=karma" />
        <SortPill label="Fazių pasiekta" active={sortKey === 'phases'} href="?sort=phases" />
        <SortPill label="Like'ai (track count)" active={sortKey === 'likes'} href="?sort=likes" />
        <SortPill label="Žinučių/komentarų" active={sortKey === 'messages'} href="?sort=messages" />
        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {data.length} narys{data.length === 1 ? '' : data.length < 10 ? 'iai' : 'ių'}
        </span>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <thead style={{ background: 'var(--card-bg)' }}>
              <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                <th className="px-3 py-2 font-semibold w-10">#</th>
                <th className="px-3 py-2 font-semibold">Narys</th>
                <th className="px-3 py-2 font-semibold text-right">Karma</th>
                <th className="px-3 py-2 font-semibold text-center">Nuotaikos daina</th>
                <th className="px-3 py-2 font-semibold text-right">Stiliai</th>
                <th className="px-3 py-2 font-semibold text-right">Atlikėjai</th>
                <th className="px-3 py-2 font-semibold text-right" title="resolved / pending per artist/album/track">Mėgsta (♥)</th>
                <th className="px-3 py-2 font-semibold text-right">Draugai</th>
                <th className="px-3 py-2 font-semibold text-right">Dienoraščiai</th>
                <th className="px-3 py-2 font-semibold text-right">Kūryba</th>
                <th className="px-3 py-2 font-semibold text-right">Vertimai</th>
                <th className="px-3 py-2 font-semibold text-right">Topai</th>
                <th className="px-3 py-2 font-semibold text-right">Dienos dainos</th>
                <th className="px-3 py-2 font-semibold text-right">Komentarai</th>
                <th className="px-3 py-2 font-semibold text-center">Fazės</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <UserRow key={r.profile_id} row={r} idx={i + 1} />
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={15} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    Nėra ghost user'ių. Paleisk: <code>python3 scraper/ugc_user_scrape.py &lt;username&gt;</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs mt-3" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        Legenda: <Dot color="green" /> ≥80% migruota · <Dot color="amber" /> 1-79% · <Dot color="red" /> 0% (negali migruoti / nepradėta).
        Likes „resolved/pending" — pending'ai automatiškai resolvenamos po atlikėjų importo.
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl"
         style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[14px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function SortPill({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link href={href}
          className="text-xs px-3 py-1.5 rounded-full transition"
          style={{
            background: active ? 'var(--text-primary)' : 'var(--card-bg)',
            color: active ? 'var(--bg-page)' : 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            fontWeight: active ? 700 : 500,
            fontFamily: "'Outfit', sans-serif",
          }}>
      {label}
    </Link>
  )
}

function UserRow({ row: r, idx }: { row: Row; idx: number }) {
  const likesResolved = r.likes_artist_resolved + r.likes_album_resolved + r.likes_track_resolved
  const likesPending = r.likes_artist_pending + r.likes_album_pending + r.likes_track_pending
  const expectedLikesArtist = r.legacy_liked_artist_count || 0
  const totalLikesNow = likesResolved + likesPending

  return (
    <tr className="hover:bg-[var(--hover-bg)] transition" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <td className="px-3 py-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{idx}</td>
      <td className="px-3 py-2">
        <Link href={`/admin/users-migration/${r.username}`} className="flex items-center gap-2 group">
          {r.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
                 style={{ background: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
              {r.username.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold group-hover:underline" style={{ color: 'var(--text-primary)' }}>
              {r.username}
            </div>
            {r.full_name && (
              <div className="text-[12px] truncate" style={{ color: 'var(--text-muted)' }}>{r.full_name}</div>
            )}
          </div>
          {r.is_claimed && <span className="text-[12px] px-1 rounded font-bold"
                                  style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>✓</span>}
        </Link>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {(r.legacy_karma_points || 0).toLocaleString('lt-LT')}
      </td>
      <PhaseCell ok={r.mood_set > 0} />
      <PhaseCell count={r.styles_count} />
      <PhaseCell count={r.favorite_artists_count} />
      <td className="px-3 py-2 text-right tabular-nums">
        <span style={{ color: likesResolved > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {likesResolved.toLocaleString('lt-LT')}
        </span>
        {likesPending > 0 && (
          <span className="ml-1 text-[12px]" style={{ color: 'var(--text-faint)' }}>
            +{likesPending.toLocaleString('lt-LT')}
          </span>
        )}
        {expectedLikesArtist > 0 && totalLikesNow === 0 && (
          <span className="text-[12px]" style={{ color: '#dc2626' }}>—</span>
        )}
      </td>
      <PhaseCell count={r.friends_count} />
      <PhaseCell count={r.diary_count} />
      <PhaseCell count={r.creation_count} />
      <PhaseCell count={r.translate_count} />
      <PhaseCell count={r.topas_count} />
      <PhaseCell count={r.daily_picks_count} />
      <PhaseCell count={r.comments_count} />
      <td className="px-3 py-2 text-center">
        <span className="text-[14px] font-bold tabular-nums">
          <span style={{ color: r.phases_touched >= 5 ? '#16a34a' : r.phases_touched >= 2 ? '#d97706' : '#dc2626' }}>
            {r.phases_touched}
          </span>
          <span style={{ color: 'var(--text-faint)' }}>/7</span>
        </span>
      </td>
    </tr>
  )
}

function PhaseCell({ ok, count }: { ok?: boolean; count?: number }) {
  // Either boolean (mood) or numeric
  const present = ok !== undefined ? ok : (count || 0) > 0
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      {present ? (
        count !== undefined ? (
          <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
            {count.toLocaleString('lt-LT')}
          </span>
        ) : (
          <span style={{ color: '#16a34a' }}>✓</span>
        )
      ) : (
        <span style={{ color: 'var(--text-faint)' }}>·</span>
      )}
    </td>
  )
}

function Dot({ color }: { color: 'green' | 'amber' | 'red' }) {
  const bg = color === 'green' ? '#16a34a' : color === 'amber' ? '#d97706' : '#dc2626'
  return (
    <span className="inline-block w-2 h-2 rounded-full mx-1 align-middle" style={{ background: bg }} />
  )
}
