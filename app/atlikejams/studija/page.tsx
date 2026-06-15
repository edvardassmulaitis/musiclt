// Studijos apžvalga (dashboard).
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from './EmptyStudio'

export const dynamic = 'force-dynamic'

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
      <div className="text-2xl font-bold text-[var(--text-primary)] font-['Outfit',sans-serif]">{value}</div>
      <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{label}</div>
      {hint && <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>}
    </div>
  )
}

export default async function StudioDashboard({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const [followersRes, weekRes, artistRow, updatesRes] = await Promise.all([
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id).gte('created_at', weekAgo),
    sb.from('artists').select('page_view_count').eq('id', active.id).maybeSingle(),
    sb.from('artist_updates').select('id, kind, title, recipients, created_at').eq('artist_id', active.id).order('created_at', { ascending: false }).limit(5),
  ])

  const followers = followersRes.count || 0
  const weekFollowers = weekRes.count || 0
  const views = (artistRow.data as any)?.page_view_count || 0
  const updates = updatesRes.data || []

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Fanai" value={followers} hint={weekFollowers > 0 ? `+${weekFollowers} per savaitę` : 'per savaitę be pokyčių'} />
        <Stat label="Profilio peržiūros" value={views} />
        <Stat label="Žinutės fanams" value={updates.length} />
        <Stat label="Nauji fanai (7 d.)" value={weekFollowers} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/atlikejams/studija/zinutes?a=${active.id}`} className="rounded-full bg-[var(--accent-orange)] px-4 py-2 text-sm font-semibold text-white">✉️ Parašyti fanams</Link>
        <Link href={`/atlikejams/studija/profilis?a=${active.id}`} className="rounded-full bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]">✏️ Redaguoti profilį</Link>
        <Link href={`/atlikejams/studija/socialiniai?a=${active.id}`} className="rounded-full bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]">📷 Pridėti soc. postą</Link>
        <Link href={`/atlikejai/${active.slug}`} className="rounded-full bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]">👁 Mano vieša anketa</Link>
      </div>

      <h2 className="mt-7 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">Paskutinės žinutės</h2>
      {updates.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Dar nesiuntei nė vienos žinutės fanams.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {updates.map((u: any) => (
            <li key={u.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">{u.title}</div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {new Date(u.created_at).toLocaleDateString('lt-LT')} · {u.recipients} gavėjų
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
