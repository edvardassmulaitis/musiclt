// app/vartotojas/ghost/[username]/page.tsx
//
// „Ghost" user'io profilis — music.lt archyvo vartotojai, kurie dar nėra
// susijungę su nauja sistema (is_claimed=false). Profilis rodo jų
// archyvinį aktyvumą: patikę atlikėjai / albumai / dainos.
//
// Matomumas:
//   /vartotojas/ghost/{username} → ghost profile
//   /vartotojas/{username}       → claimed user profile (existing)
//
// Kai vartotojas reactivate'ins profile'ą (pagal email match'ą), is_claimed=true
// ir frontend redirect'ins iš /ghost/ į /vartotojas/ (arba atskira pages
// grandinė).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { LegacyBadge } from '@/components/LegacyLikesPanel'

export const revalidate = 0

type Props = { params: Promise<{ username: string }> }

type GhostUser = {
  username: string
  mention_count: number | null
  first_seen_category: string | null
  first_seen_url: string | null
  registered_date: string | null
  rating_points: number | null
  avatar_url: string | null
  is_claimed: boolean
  imported_at: string
}

type ArtistStub = { id: number; slug: string; name: string; legacy_id: number | null; cover_image_url: string | null }
type AlbumStub = { id: number; slug: string; title: string; year: number | null; legacy_id: number | null; cover_image_url: string | null; artist: { slug: string; name: string } | null }
type TrackStub = { id: number; slug: string; title: string; legacy_id: number | null; artist: { slug: string; name: string } | null }

async function getGhostUser(username: string): Promise<GhostUser | null> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('user_ghosts')
    .select('username, mention_count, first_seen_category, first_seen_url, registered_date, rating_points, avatar_url, is_claimed, imported_at')
    .ilike('username', username) // LT simboliai / case match
    .maybeSingle()
  return (data as GhostUser) || null
}

async function getGhostActivity(username: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('legacy_likes')
    .select('entity_type, entity_legacy_id, user_rank')
    .eq('user_username', username)
    .range(0, 9999)
  const rows = (data as { entity_type: string; entity_legacy_id: number; user_rank: string | null }[]) || []

  const artistIds = new Set<number>()
  const albumIds = new Set<number>()
  const trackIds = new Set<number>()
  let user_rank: string | null = null
  for (const r of rows) {
    if (!user_rank && r.user_rank) user_rank = r.user_rank
    if (r.entity_type === 'artist') artistIds.add(r.entity_legacy_id)
    else if (r.entity_type === 'album') albumIds.add(r.entity_legacy_id)
    else if (r.entity_type === 'track') trackIds.add(r.entity_legacy_id)
  }

  const [artistsRes, albumsRes, tracksRes] = await Promise.all([
    artistIds.size > 0
      ? sb.from('artists')
          .select('id, slug, name, legacy_id, cover_image_url')
          .in('legacy_id', Array.from(artistIds))
          .limit(60)
      : Promise.resolve({ data: [] as any[] }),
    albumIds.size > 0
      ? sb.from('albums')
          .select('id, slug, title, year, legacy_id, cover_image_url, artists:artist_id(slug, name)')
          .in('legacy_id', Array.from(albumIds))
          .limit(60)
      : Promise.resolve({ data: [] as any[] }),
    trackIds.size > 0
      ? sb.from('tracks')
          .select('id, slug, title, legacy_id, artists:artist_id(slug, name)')
          .in('legacy_id', Array.from(trackIds))
          .limit(80)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const artists = (((artistsRes as any).data as any[]) || []) as ArtistStub[]
  const albums = (((albumsRes as any).data as any[]) || []).map((a: any) => ({
    id: a.id, slug: a.slug, title: a.title, year: a.year, legacy_id: a.legacy_id,
    cover_image_url: a.cover_image_url,
    artist: a.artists ? { slug: a.artists.slug, name: a.artists.name } : null,
  })) as AlbumStub[]
  const tracks = (((tracksRes as any).data as any[]) || []).map((t: any) => ({
    id: t.id, slug: t.slug, title: t.title, legacy_id: t.legacy_id,
    artist: t.artists ? { slug: t.artists.slug, name: t.artists.name } : null,
  })) as TrackStub[]

  return {
    totalLikes: rows.length,
    artistLikesCount: artistIds.size,
    albumLikesCount: albumIds.size,
    trackLikesCount: trackIds.size,
    user_rank,
    artists,
    albums,
    tracks,
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const uname = decodeURIComponent(username)
  const user = await getGhostUser(uname)
  if (!user) return { title: 'Ghost vartotojas nerastas — music.lt' }
  return {
    title: `${user.username} (music.lt archyvo vartotojas) — music.lt`,
    description: `${user.username} archyvinis profilis: legacy music.lt community vartotojas.`,
  }
}

export default async function GhostUserPage({ params }: Props) {
  const { username } = await params
  const uname = decodeURIComponent(username)
  const user = await getGhostUser(uname)
  if (!user) notFound()

  // Jeigu ghost user'is jau claimed — redirect į tikrą /vartotojas/[username] (ateityje)
  // Kol kas: jei is_claimed=true, vis tiek rodom ghost view su info apie claimed statusą.

  const activity = await getGhostActivity(user.username)
  const firstLetter = (user.username[0] || '?').toUpperCase()

  return (
    <div
      style={{
        background: 'var(--bg-body)',
        color: 'var(--text-primary)',
        fontFamily: "'DM Sans',system-ui,sans-serif",
        minHeight: '100vh',
      }}
    >
      {/* ═══ HERO ═══ */}
      <div
        style={{
          position: 'relative',
          padding: '48px 0 36px',
          background: 'linear-gradient(160deg, rgba(251,191,36,.08), transparent 55%), var(--bg-body)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(251,191,36,.2), rgba(249,115,22,.08))',
              border: '2px solid rgba(251,191,36,.28)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 8px 28px rgba(251,191,36,.14)',
            }}
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.username} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: 38, fontWeight: 900, color: '#fbbf24' }}>{firstLetter}</span>
            )}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1
                style={{
                  fontFamily: 'Outfit,sans-serif',
                  fontSize: 'clamp(22px, 3.4vw, 34px)',
                  fontWeight: 900,
                  letterSpacing: '-.025em',
                  color: 'var(--text-primary)',
                  margin: 0,
                  wordBreak: 'break-word',
                }}
              >
                @{user.username}
              </h1>
              <LegacyBadge label="ghost vartotojas" />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {activity.user_rank && (
                <span>
                  <span style={{ color: 'var(--text-faint)' }}>music.lt rank:</span>{' '}
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{activity.user_rank}</span>
                </span>
              )}
              {user.registered_date && (
                <span>
                  <span style={{ color: 'var(--text-faint)' }}>registruotas:</span>{' '}
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{user.registered_date}</span>
                </span>
              )}
              {user.rating_points !== null && (
                <span>
                  <span style={{ color: 'var(--text-faint)' }}>taškai:</span>{' '}
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{user.rating_points}</span>
                </span>
              )}
            </div>
          </div>

          {/* Claim CTA */}
          <div style={{ flexShrink: 0 }}>
            {user.is_claimed ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-default)',
                  fontFamily: 'Outfit,sans-serif',
                }}
              >
                ✓ Profilis jau susietas
              </div>
            ) : (
              <Link
                href={`/auth/signin?claim=${encodeURIComponent(user.username)}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 18px',
                  borderRadius: 999,
                  background: '#f97316',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  textDecoration: 'none',
                  fontFamily: 'Outfit,sans-serif',
                  boxShadow: '0 4px 16px rgba(249,115,22,.25)',
                  whiteSpace: 'nowrap',
                }}
              >
                Perimti šį profilį →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 60px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Stats strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          <StatTile label={'Viso „patinka"'} value={activity.totalLikes} />
          <StatTile label="Patikę atlikėjai" value={activity.artistLikesCount} />
          <StatTile label="Patikę albumai" value={activity.albumLikesCount} />
          <StatTile label="Patikusios dainos" value={activity.trackLikesCount} />
        </div>

        {/* Info bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(251,191,36,.04)',
            border: '1px solid rgba(251,191,36,.14)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <div style={{ flexShrink: 0, color: '#fbbf24', fontSize: 16, lineHeight: 1 }}>i</div>
          <div>
            Šis profilis atkurtas iš <strong>music.lt archyvo</strong>. Jei tai tu — paspausk
            „Perimti šį profilį" ir susiesim jį su naujosios versijos paskyra pagal el. paštą,
            kurį turėjai senojoje sistemoje.
          </div>
        </div>

        {/* Liked artists */}
        <SectionBlock
          title={`Patikę atlikėjai (${activity.artistLikesCount})`}
          empty={activity.artists.length === 0}
          emptyText="Šis vartotojas dar nepažymėjo nė vieno atlikėjo music.lt archyve."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {activity.artists.map((a) => (
              <Link
                key={a.id}
                href={`/atlikejai/${a.slug}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  padding: '14px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--border-default)',
                  background: 'var(--card-bg)',
                  textDecoration: 'none',
                  textAlign: 'center',
                }}
              >
                {a.cover_image_url ? (
                  <img src={a.cover_image_url} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--cover-placeholder)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: 'var(--text-faint)', fontFamily: 'Outfit,sans-serif' }}>
                    {a.name[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                  {a.name}
                </div>
              </Link>
            ))}
          </div>
        </SectionBlock>

        {/* Liked albums */}
        <SectionBlock
          title={`Patikę albumai (${activity.albumLikesCount})`}
          empty={activity.albums.length === 0}
          emptyText="Dar nė vieno albumo."
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 10,
            }}
          >
            {activity.albums.map((a) => (
              <Link
                key={a.id}
                href={`/lt/albumas/${a.slug}/${a.id}/`}
                style={{
                  display: 'block',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: '1px solid var(--border-default)',
                  background: 'var(--card-bg)',
                  textDecoration: 'none',
                }}
              >
                <div style={{ aspectRatio: '1', background: 'var(--cover-placeholder)', overflow: 'hidden' }}>
                  {a.cover_image_url ? (
                    <img src={a.cover_image_url} alt={a.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'var(--text-faint)' }}>💿</div>
                  )}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.artist?.name}
                    {a.year ? ` · ${a.year}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionBlock>

        {/* Liked tracks */}
        <SectionBlock
          title={`Patikusios dainos (${activity.trackLikesCount})`}
          empty={activity.tracks.length === 0}
          emptyText="Dar nė vienos dainos."
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {activity.tracks.map((t, i) => (
              <Link
                key={t.id}
                href={`/lt/daina/${t.slug}/${t.id}/`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderBottom: i < activity.tracks.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  textDecoration: 'none',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fbbf24' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.title}
                  </div>
                  {t.artist && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      {t.artist.name}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#f97316', fontWeight: 700, fontFamily: 'Outfit,sans-serif', flexShrink: 0 }}>→</span>
              </Link>
            ))}
          </div>
        </SectionBlock>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        style={{
          fontFamily: 'Outfit,sans-serif',
          fontSize: 22,
          fontWeight: 900,
          color: 'var(--text-primary)',
          lineHeight: 1,
          letterSpacing: '-.02em',
        }}
      >
        {value.toLocaleString('lt-LT')}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: 'var(--text-muted)',
          marginTop: 6,
          fontFamily: 'Outfit,sans-serif',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function SectionBlock({
  title,
  empty,
  emptyText,
  children,
}: {
  title: string
  empty: boolean
  emptyText: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div
        style={{
          fontFamily: 'Outfit,sans-serif',
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '.14em',
          color: 'var(--section-label)',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {title}
        <span style={{ flex: 1, height: 1, background: 'var(--section-line)' }} />
      </div>
      {empty ? (
        <div
          style={{
            padding: 18,
            borderRadius: 10,
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--text-faint)',
          }}
        >
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
