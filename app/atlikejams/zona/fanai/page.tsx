import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists, pickActiveArtist } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'
import EmptyStudio from '../EmptyStudio'

export const dynamic = 'force-dynamic'

export default async function StudioFans({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  const artists = profile?.id ? await getTeamArtists(profile.id) : []
  const active = pickActiveArtist(artists, sp.a)
  if (!active) return <EmptyStudio />

  const sb = createAdminClient()
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString()
  const [likesR, totalR, weekR, monthR, emailR, listR, artistR] = await Promise.all([
    sb.from('likes').select('*', { count: 'exact', head: true }).eq('entity_type', 'artist').eq('entity_id', active.id),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id).gte('created_at', weekAgo),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id).gte('created_at', monthAgo),
    sb.from('artist_follows').select('*', { count: 'exact', head: true }).eq('artist_id', active.id).eq('email_consent', true),
    sb.from('artist_follows').select('created_at, city, user_id, profiles!inner(username, full_name, avatar_url)').eq('artist_id', active.id).order('created_at', { ascending: false }).limit(40),
    sb.from('artists').select('legacy_likes').eq('id', active.id).maybeSingle(),
  ])

  const total = totalR.count || 0
  const fans = (listR.data || []) as any[]
  const likeFans = Math.max(likesR.count || 0, (artistR.data as any)?.legacy_likes || 0)

  return (
    <div className="max-w-2xl">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Fanai (patinka)', likeFans], ['Sekėjai', total], ['Nauji sekėjai (30 d.)', monthR.count || 0], ['Gauna el. laiškus', emailR.count || 0]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
            <div className="text-2xl font-bold text-[var(--text-primary)] font-['Outfit',sans-serif]">{v as number}</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{l as string}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        <b>Fanai</b> — kiek žmonių pažymėjo „patinka". <b>Sekėjai</b> — kas užsiprenumeravo tavo naujienas (gauna pranešimus/žinutes). Skatink fanus paspausti „Sekti" anketoje, kad galėtum su jais kalbėtis.
      </p>

      <div className="mt-4">
        <Link href={`/atlikejams/zona/zinutes?a=${active.id}`} className="rounded-full bg-[var(--accent-orange)] px-4 py-2 text-sm font-semibold text-white">✉️ Parašyti fanams</Link>
      </div>

      <h2 className="mt-7 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">Naujausi fanai</h2>
      {fans.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">Dar nė vieno fano. Pasidalink savo anketos nuoroda — kiekvienas gali tapti fanu paspaudęs „Sekti".</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
          {fans.map((f, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="h-8 w-8 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                {f.profiles?.avatar_url ? <img src={f.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-[var(--text-primary)]">{f.profiles?.full_name || f.profiles?.username || 'Fanas'}</div>
                {f.city && <div className="text-xs text-[var(--text-muted)]">{f.city}</div>}
              </div>
              <div className="text-xs text-[var(--text-faint)]">{new Date(f.created_at).toLocaleDateString('lt-LT')}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
