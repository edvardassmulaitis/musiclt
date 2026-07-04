// app/admin/users-migration/[username]/page.tsx
//
// Per-user UGC migracijos detail view'as: visi atvežti duomenys + CLI
// re-run komandos kiekvienai fazei. Be backend execute'inimo — Edvardas
// runs scrape ant Mac'o, čia tik dashboard'as kas kur yra.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase'
import { CopyButton } from './copy-button'

type Props = { params: Promise<{ username: string }> }

type DailyPickRow = {
  id: number
  picked_on: string
  track_id: number | null
  legacy_track_id: number | null
  comment: string | null
  like_count: number
  tracks?: { id: number; slug: string | null; title: string; artists?: { name: string; slug: string }[] | null }[] | null
}

type BlogRow = {
  id: string
  legacy_id: number
  legacy_source: string
  post_type: string
  title: string
  published_at: string | null
  slug: string
  comment_count: number | null
  blogs?: { slug: string } | { slug: string }[] | null
}

type LikeRow = {
  id: number
  entity_type: string
  entity_id: number | null
  entity_legacy_id: number | null
  created_at: string
}

type FriendRow = {
  friend_id: string
  friends?: { username: string; full_name: string | null; avatar_url: string | null }[] | { username: string; full_name: string | null; avatar_url: string | null } | null
}

type StyleRow = {
  style_slug: string
  style_name: string
  legacy_style_id: number
  sort_order: number
}

export default async function UserMigrationDetailPage({ params }: Props) {
  const { username } = await params
  const sb = createAdminClient()

  // 1. Pagrindinis statusas iš v_user_migration_status
  const { data: status, error: statusErr } = await sb
    .from('v_user_migration_status')
    .select('*')
    .ilike('username', username)
    .single()

  if (statusErr || !status) {
    return notFound()
  }

  const s: any = status

  // 2. Paralel — atskirų lentelių paskutiniai įrašai (sample, ne all)
  const [dailyPicks, blogPosts, likesArtists, likesAlbums, likesTracks, friends, styles, moodTrackQ] = await Promise.all([
    sb.from('daily_song_picks')
      .select('id, picked_on, track_id, legacy_track_id, comment, like_count, tracks:track_id(id, slug, title, artists:artist_id(name, slug))')
      .eq('author_id', s.profile_id).order('picked_on', { ascending: false }).limit(15),
    sb.from('blog_posts')
      .select('id, legacy_id, legacy_source, post_type, title, published_at, slug, comment_count, blogs:blog_id(slug)')
      .eq('user_id', s.profile_id).order('published_at', { ascending: false }).limit(15),
    sb.from('likes')
      .select('id, entity_type, entity_id, entity_legacy_id, created_at')
      .eq('user_username', s.username).eq('entity_type', 'artist').order('id', { ascending: false }).limit(5),
    sb.from('likes')
      .select('id, entity_type, entity_id, entity_legacy_id, created_at')
      .eq('user_username', s.username).eq('entity_type', 'album').order('id', { ascending: false }).limit(5),
    sb.from('likes')
      .select('id, entity_type, entity_id, entity_legacy_id, created_at')
      .eq('user_username', s.username).eq('entity_type', 'track').order('id', { ascending: false }).limit(5),
    sb.from('user_friendships')
      .select('friend_id, friends:friend_id(username, full_name, avatar_url)')
      .eq('profile_id', s.profile_id).limit(24),
    sb.from('profile_favorite_styles')
      .select('style_slug, style_name, legacy_style_id, sort_order')
      .eq('profile_id', s.profile_id).order('sort_order'),
    s.mood_set
      ? sb.from('profiles').select('mood_song_track_id, mood_song_set_at')
          .eq('id', s.profile_id).single()
      : Promise.resolve({ data: null }),
  ])

  let moodTrack: any = null
  if ((moodTrackQ as any).data?.mood_song_track_id) {
    const { data: mt } = await sb.from('tracks')
      .select('id, slug, title, artists:artist_id(name, slug)')
      .eq('id', (moodTrackQ as any).data.mood_song_track_id).single()
    moodTrack = mt
  }

  // CLI runner template (per-faze ir all)
  const cliAll = `python3 scraper/ugc_user_scrape.py ${s.username}`
  const cliPhase = (ph: string) => `python3 scraper/ugc_user_scrape.py ${s.username} --phases ${ph}`

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" style={{ fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <Link href="/admin/users-migration" className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
          ← Visi nariai
        </Link>
        <Link href={`/@${s.username}`}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
          Žiūrėti viešą profilį →
        </Link>
      </div>

      <div className="flex items-start gap-4 mb-6">
        {s.avatar_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={s.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
               style={{ background: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
            {s.username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">{s.username}</h1>
          {s.full_name && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{s.full_name}</div>}
          <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
            {s.legacy_user_id && <span>legacy_uid <b style={{ color: 'var(--text-primary)' }}>{s.legacy_user_id}</b></span>}
            {s.legacy_karma_points && <span>· karma <b style={{ color: 'var(--text-primary)' }}>{s.legacy_karma_points.toLocaleString('lt-LT')}</b></span>}
            {s.joined_legacy_at && <span>· narys nuo {s.joined_legacy_at}</span>}
            {s.is_claimed
              ? <span className="px-1.5 py-0.5 rounded text-[12px] font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>CLAIM&apos;intas</span>
              : <span className="px-1.5 py-0.5 rounded text-[12px] font-bold" style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706' }}>GHOST</span>
            }
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Fazės pasiektos</div>
          <div className="text-3xl font-extrabold tabular-nums"
               style={{ color: s.phases_touched >= 5 ? '#16a34a' : s.phases_touched >= 2 ? '#d97706' : '#dc2626' }}>
            {s.phases_touched}<span style={{ color: 'var(--text-faint)', fontSize: 18 }}>/7</span>
          </div>
        </div>
      </div>

      {/* Re-run ALL */}
      <div className="rounded-2xl p-3 mb-5 flex items-center justify-between gap-3"
           style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
        <div>
          <div className="text-xs font-semibold mb-0.5">Iš naujo paleisti visas fazes</div>
          <code className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{cliAll}</code>
        </div>
        <CopyButton text={cliAll} label="Kopijuoti" />
      </div>

      {/* Phase: Profile + mood */}
      <PhaseCard
        title="Profilis + nuotaikos daina"
        status={s.legacy_user_id ? 'done' : 'missing'}
        cliCmd={cliPhase('profile,mood')}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="legacy_user_id" value={s.legacy_user_id || '—'} />
          <Stat label="login_count" value={s.legacy_login_count?.toLocaleString('lt-LT') || '—'} />
          <Stat label="message_count" value={s.legacy_message_count?.toLocaleString('lt-LT') || '—'} />
          <Stat label="Nuotaikos daina" value={s.mood_set ? '✓' : '—'} />
        </div>
        {moodTrack && (
          <div className="mt-2 text-xs p-2 rounded-lg"
               style={{ background: 'var(--bg-page)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ color: 'var(--text-muted)' }}>♪ </span>
            <b>{(Array.isArray(moodTrack.artists) ? moodTrack.artists[0] : moodTrack.artists)?.name}</b> — {moodTrack.title}
          </div>
        )}
      </PhaseCard>

      {/* Phase: Styles + artists */}
      <PhaseCard
        title="Muzikinis skonis (stiliai + atlikėjai)"
        status={(s.styles_count + s.favorite_artists_count) > 0 ? 'done' : 'missing'}
        cliCmd={cliPhase('profile')}
      >
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Stiliai" value={`${s.styles_count}`} />
          <Stat label="Atlikėjai (profile)" value={`${s.favorite_artists_count}`} />
        </div>
        {(styles.data || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(styles.data as StyleRow[]).slice(0, 14).map((st) => (
              <span key={st.legacy_style_id} className="text-[13px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--bg-page)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                {st.style_name}
              </span>
            ))}
          </div>
        )}
      </PhaseCard>

      {/* Phase: Likes */}
      <PhaseCard
        title="Palaikymai (♥ artist/album/track)"
        status={(s.likes_artist_resolved + s.likes_album_resolved + s.likes_track_resolved + s.likes_artist_pending + s.likes_album_pending + s.likes_track_pending) > 0 ? 'done' : 'missing'}
        cliCmd={cliPhase('likes')}
      >
        <div className="grid grid-cols-3 gap-2">
          <LikesBucket kind="Atlikėjai" resolved={s.likes_artist_resolved} pending={s.likes_artist_pending} expected={s.legacy_liked_artist_count} />
          <LikesBucket kind="Albumai"   resolved={s.likes_album_resolved}  pending={s.likes_album_pending}  expected={s.legacy_liked_album_count} />
          <LikesBucket kind="Dainos"    resolved={s.likes_track_resolved}  pending={s.likes_track_pending}  expected={s.legacy_liked_track_count} />
        </div>
        <details className="mt-3">
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--text-muted)' }}>Naujausi likes pavyzdžiai</summary>
          <div className="grid grid-cols-3 gap-3 mt-2 text-[13px]">
            <LikesSample title="Atlikėjai" rows={(likesArtists.data || []) as LikeRow[]} />
            <LikesSample title="Albumai"   rows={(likesAlbums.data  || []) as LikeRow[]} />
            <LikesSample title="Dainos"    rows={(likesTracks.data  || []) as LikeRow[]} />
          </div>
        </details>
      </PhaseCard>

      {/* Phase: Blog posts (diary/creation/translate/topas) */}
      <PhaseCard
        title="Tinklaraštis (dienoraštis · kūryba · vertimai · topai)"
        status={(s.diary_count + s.creation_count + s.translate_count + s.topas_count) > 0 ? 'done' : 'missing'}
        cliCmd={cliPhase('diary,creation,translate,topas')}
      >
        <div className="grid grid-cols-4 gap-2 text-xs mb-2">
          <Stat label="Dienoraščiai" value={`${s.diary_count}`} />
          <Stat label="Kūryba" value={`${s.creation_count}`} />
          <Stat label="Vertimai" value={`${s.translate_count}`} />
          <Stat label="Topai" value={`${s.topas_count}`} />
        </div>
        {(blogPosts.data || []).length > 0 && (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-1 px-2">Įrašas</th>
                <th className="text-left py-1 px-2 w-28">Tipas</th>
                <th className="text-left py-1 px-2 w-32">Data</th>
                <th className="text-right py-1 px-2 w-16">Kom.</th>
              </tr>
            </thead>
            <tbody>
              {(blogPosts.data as BlogRow[]).map((p) => {
                const blogSlug = Array.isArray(p.blogs) ? p.blogs[0]?.slug : p.blogs?.slug
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1 px-2 truncate max-w-md">
                      {blogSlug
                        ? <Link href={`/blogas/${blogSlug}/${p.slug}`} className="hover:underline">{p.title}</Link>
                        : p.title}
                    </td>
                    <td className="py-1 px-2" style={{ color: 'var(--text-muted)' }}>{p.legacy_source || p.post_type}</td>
                    <td className="py-1 px-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>
                      {p.published_at ? new Date(p.published_at).toISOString().slice(0, 10) : '—'}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>{p.comment_count ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </PhaseCard>

      {/* Phase: Daily picks */}
      <PhaseCard
        title="Dienos dainos"
        status={s.daily_picks_count > 0 ? 'done' : 'missing'}
        cliCmd={cliPhase('daily')}
      >
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          <Stat label="Iš viso" value={`${s.daily_picks_count}`} />
          <Stat label="Resolved (track_id ≠ NULL)" value={`${s.daily_picks_resolved}`} />
          <Stat label="Laukia tracks importo" value={`${s.daily_picks_count - s.daily_picks_resolved}`} />
        </div>
        {(dailyPicks.data || []).length > 0 && (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-1 px-2 w-24">Data</th>
                <th className="text-left py-1 px-2">Daina</th>
                <th className="text-right py-1 px-2 w-16">♥</th>
              </tr>
            </thead>
            <tbody>
              {(dailyPicks.data as DailyPickRow[]).map((p) => {
                const t = Array.isArray(p.tracks) ? p.tracks[0] : p.tracks
                const a = t && (Array.isArray(t.artists) ? t.artists[0] : t.artists)
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1 px-2 tabular-nums" style={{ color: 'var(--text-muted)' }}>{p.picked_on}</td>
                    <td className="py-1 px-2 truncate max-w-md">
                      {t
                        ? <span><b>{a?.name || '—'}</b> — {t.title}</span>
                        : <span style={{ color: 'var(--text-faint)' }}>legacy_track_id={p.legacy_track_id} (laukia importo)</span>}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums">{p.like_count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </PhaseCard>

      {/* Phase: Friends */}
      <PhaseCard
        title="Draugai"
        status={s.friends_count > 0 ? 'done' : 'missing'}
        cliCmd={cliPhase('friends')}
      >
        <Stat label="Iš viso" value={`${s.friends_count}`} />
        {(friends.data || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(friends.data as FriendRow[]).map((f, i) => {
              const fr = Array.isArray(f.friends) ? f.friends[0] : f.friends
              if (!fr) return null
              return (
                <Link key={i} href={`/@${fr.username}`}
                      className="text-[13px] px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--bg-page)', border: '1px solid var(--border-subtle)' }}>
                  {fr.username}
                </Link>
              )
            })}
          </div>
        )}
      </PhaseCard>

      {/* Phase: Comments */}
      <PhaseCard
        title="Komentarai (kaip autorius)"
        status={s.comments_count > 0 ? 'done' : 'missing'}
        cliCmd="# import_artist.py pipeline tvarko per canonical pipeline (forum_lib.py)"
      >
        <Stat label="Iš viso komentarų" value={`${s.comments_count}`} />
        <div className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Komentarai importuojami per kanoninį forum pipeline'ą (forum_lib.py), ne per ugc_user_scrape.py.
        </div>
      </PhaseCard>
    </div>
  )
}

function PhaseCard({ title, status, children, cliCmd }: {
  title: string
  status: 'done' | 'partial' | 'missing'
  children: React.ReactNode
  cliCmd: string
}) {
  const dotColor = status === 'done' ? '#16a34a' : status === 'partial' ? '#d97706' : '#dc2626'
  return (
    <section className="mb-4 rounded-2xl p-3 sm:p-4"
             style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: dotColor }} />
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <code className="text-[12px] px-2 py-1 rounded"
                style={{ background: 'var(--bg-page)', color: 'var(--text-muted)' }}>
            {cliCmd}
          </code>
          <CopyButton text={cliCmd} label="copy" />
        </div>
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2 rounded-lg"
         style={{ background: 'var(--bg-page)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  )
}

function LikesBucket({ kind, resolved, pending, expected }: {
  kind: string; resolved: number; pending: number; expected: number | null
}) {
  const total = resolved + pending
  const expectedNum = expected || 0
  const completePct = expectedNum > 0 ? Math.round((total / expectedNum) * 100) : 100
  return (
    <div className="p-2 rounded-lg" style={{ background: 'var(--bg-page)', border: '1px solid var(--border-subtle)' }}>
      <div className="text-[12px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{kind}</div>
      <div className="text-sm font-bold tabular-nums">
        <span style={{ color: 'var(--text-primary)' }}>{resolved.toLocaleString('lt-LT')}</span>
        <span className="text-[12px] mx-1" style={{ color: 'var(--text-faint)' }}>resolved</span>
        {pending > 0 && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>· {pending.toLocaleString('lt-LT')}</span>
            <span className="text-[12px] mx-1" style={{ color: 'var(--text-faint)' }}>pending</span>
          </>
        )}
      </div>
      {expectedNum > 0 && (
        <div className="text-[12px] mt-0.5" style={{ color: completePct >= 90 ? '#16a34a' : completePct >= 50 ? '#d97706' : '#dc2626' }}>
          {completePct}% (laukta {expectedNum.toLocaleString('lt-LT')})
        </div>
      )}
    </div>
  )
}

function LikesSample({ title, rows }: { title: string; rows: LikeRow[] }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{title}</div>
      <ul className="space-y-0.5">
        {rows.length === 0 && <li style={{ color: 'var(--text-faint)' }}>—</li>}
        {rows.map((l) => (
          <li key={l.id} className="tabular-nums">
            legacy {l.entity_legacy_id} {l.entity_id !== null ? `→ #${l.entity_id}` : <span style={{ color: 'var(--text-faint)' }}>(pending)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
