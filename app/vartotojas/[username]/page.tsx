// app/vartotojas/[username]/page.tsx
//
// V4 — dashboard layout. Plotis išnaudojamas, sekcijos kompaktiškos.
// Equalizer side-panel'e kaip artist player slot'e.
//
// Layout overview (desktop):
//
//   ┌──────────────────────────────────────┬──────────────────────┐
//   │ Identity (avatar, name, meta, bio)   │  Side Equalizer      │
//   │                                       │  (fixed order, GENRE │
//   │ Mėgstami stiliai chips (popularity)  │  COLORS palette)     │
//   └──────────────────────────────────────┴──────────────────────┘
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Nuotaikos daina — compact horizontal card                    │
//   └──────────────────────────────────────────────────────────────┘
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Dienos dainos carousel                                       │
//   └──────────────────────────────────────────────────────────────┘
//   ┌─────────────────────────────┬────────────────────────────────┐
//   │ Mėgstami atlikėjai grid     │ Tinklaraščio įrašai            │
//   └─────────────────────────────┴────────────────────────────────┘
//   ┌─────────────────────────────┬────────────────────────────────┐
//   │ Topai                       │ Vertimai                       │
//   └─────────────────────────────┴────────────────────────────────┘
//   ┌──────────────────────────────────────────────────────────────┐
//   │ Draugai avatarai                                             │
//   └──────────────────────────────────────────────────────────────┘

import { notFound } from 'next/navigation'
import {
  getProfileByUsername,
  getProfileFavoriteArtists,
  getProfileFavoriteStyles,
  getProfileFriends,
  getBlogByUserId,
  getUserContentStats,
  getDailySongPicks,
  getMoodSongTrack,
  getUserTranslations,
} from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SideEqualizer } from '@/components/profile/SideEqualizer'
import { FavoriteStylesChips } from '@/components/profile/FavoriteStylesChips'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile) return { title: 'Nerastas — music.lt' }
  return {
    title: `${profile.full_name || profile.username} — music.lt`,
    description: profile.bio || `${profile.full_name || username} muzikos profilis`,
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const profile: any = await getProfileByUsername(username)
  if (!profile || !profile.is_public) notFound()

  const [favoriteArtists, favoriteStyles, friends, blog, stats, moodTrack, dailyPicks, translations] = await Promise.all([
    getProfileFavoriteArtists(profile.id),
    getProfileFavoriteStyles(profile.id),
    getProfileFriends(profile.id, 24),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 12),
    getUserTranslations(profile.id, 4),
  ])

  let regularPosts: any[] = []
  let topasPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count, comment_count, post_type, tags, list_items')
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(20)
    const all = data || []
    regularPosts = all.filter((p: any) => p.post_type !== 'topas' && p.post_type !== 'translation').slice(0, 4)
    topasPosts = all.filter((p: any) => p.post_type === 'topas').slice(0, 4)
  }

  const memberSinceDate = profile.joined_legacy_at ? new Date(profile.joined_legacy_at) : new Date(profile.created_at)
  const memberSinceYear = memberSinceDate.getFullYear()

  return (
    <ProfileView
      profile={profile}
      favoriteArtists={favoriteArtists}
      favoriteStyles={favoriteStyles}
      friends={friends}
      blog={blog}
      regularPosts={regularPosts}
      topasPosts={topasPosts}
      memberSinceYear={memberSinceYear}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// View
// ─────────────────────────────────────────────────────────────────────────────

function ProfileView({
  profile, favoriteArtists, favoriteStyles, friends, blog,
  regularPosts, topasPosts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
}: any) {
  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks
  const heroImage = profile.cover_image_url || profile.avatar_url

  return (
    <div className="min-h-screen bg-[var(--bg-surface,#080c12)] text-[var(--text-primary,#f0f2f5)]">
      {/* ── Subtle backdrop ──────────────────────────────────────── */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 max-h-[600px] overflow-hidden">
          {heroImage ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${heroImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(80px) saturate(1.6) brightness(0.4)',
                  transform: 'scale(1.4)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-[var(--bg-surface,#080c12)]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] via-[#0f1622] to-[#080c12]" />
          )}
        </div>

        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12">

          {/* ── Identity row — left identity + right equalizer ──── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 lg:items-start">

            {/* LEFT — identity */}
            <div className="min-w-0">
              <div className="flex items-center gap-4 sm:gap-5 mb-4">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || profile.username}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                    />
                  ) : (
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-3xl sm:text-4xl font-black text-white/30 border-2 border-white/10">
                      {(profile.full_name || profile.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  {profile.is_vip_legacy && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[9px] font-extrabold uppercase tracking-wider shadow">
                      VIP
                    </span>
                  )}
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <h1
                    className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                    style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)', fontFamily: "'Outfit', sans-serif" }}
                  >
                    {profile.full_name || profile.username}
                  </h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#b0bdd4]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    <span className="font-semibold">@{profile.username}</span>
                    {profile.legacy_city && <><span className="text-[#5e7290]">·</span><span>{profile.legacy_city}</span></>}
                    {profile.legacy_age && <><span className="text-[#5e7290]">·</span><span>{profile.legacy_age} m.</span></>}
                    <span className="text-[#5e7290]">·</span>
                    <span>nuo {memberSinceYear}</span>
                    {isLegacy && isUnclaimed && (
                      <span className="text-[9px] font-bold text-[#5e7290] uppercase tracking-wider bg-white/[.04] border border-white/[.08] rounded-full px-2 py-0.5">
                        archyvinis
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio — compact */}
              {profile.bio && (
                <div className="mb-4 text-sm sm:text-[15px] text-[#c8d8f0] leading-relaxed whitespace-pre-line line-clamp-3 max-w-[680px]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {profile.bio}
                </div>
              )}

              {/* Stats inline chips */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                {profile.legacy_karma_points !== null && profile.legacy_karma_points !== undefined && (
                  <InlineStat label="taškų" value={profile.legacy_karma_points.toLocaleString('lt-LT')} accent="#f97316" />
                )}
                {stats.diary > 0 && <InlineStat label="dienoraščiai" value={stats.diary.toString()} accent="#fbbf24" />}
                {stats.daily_picks > 0 && <InlineStat label="dienos dainos" value={stats.daily_picks.toLocaleString('lt-LT')} accent="#10b981" />}
                {stats.translate > 0 && <InlineStat label="vertimai" value={stats.translate.toString()} accent="#a855f7" />}
                {stats.comments_received > 0 && <InlineStat label="komentarai" value={stats.comments_received.toLocaleString('lt-LT')} accent="#06b6d4" />}
              </div>

              {/* Favorite styles chips (popularity flavor) */}
              {favoriteStyles && favoriteStyles.length > 0 && (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#5e7290] mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    Mėgstamiausi stiliai
                  </div>
                  <FavoriteStylesChips styles={favoriteStyles} />
                </div>
              )}
            </div>

            {/* RIGHT — side equalizer */}
            <div className="lg:sticky lg:top-6">
              <SideEqualizer meter={profile.legacy_music_meter} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Body sections ────────────────────────────────────────── */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-24">

        {/* Mood song — compact horizontal card (NE full-bleed vinyl) */}
        {moodTrack && (
          <CompactMoodSong track={moodTrack} username={profile.full_name || profile.username} />
        )}

        {/* Daily picks carousel */}
        {dailyPicks.length > 0 && (
          <section className="mt-10 sm:mt-14">
            <SectionHeader
              eyebrow="Dienos dainos"
              title="Kasdienis pasirinkimas"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
              link={stats.daily_picks > dailyPicks.length ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksCarousel picks={dailyPicks} />
          </section>
        )}

        {/* Two-col: Atlikėjai | Įrašai */}
        {(favoriteArtists.length > 0 || (blog && regularPosts.length > 0)) && (
          <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {favoriteArtists.length > 0 && (
              <section>
                <SectionHeader eyebrow="Mėgstami atlikėjai" title="Kuria nuotaiką" />
                <FavoriteArtistsCompact artists={favoriteArtists.slice(0, 8)} />
              </section>
            )}
            {blog && regularPosts.length > 0 && (
              <section>
                <SectionHeader
                  eyebrow="Tinklaraštis"
                  title="Įrašai"
                  meta={stats.diary > regularPosts.length ? `${stats.diary} įrašų` : null}
                  link={{ href: `/blogas/${blog.slug}`, label: 'Visi →' }}
                />
                <PostsCompact blogSlug={blog.slug} posts={regularPosts} />
              </section>
            )}
          </div>
        )}

        {/* Two-col: Topai | Vertimai */}
        {(topasPosts.length > 0 || translations.length > 0) && (
          <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {blog && topasPosts.length > 0 && (
              <section>
                <SectionHeader
                  eyebrow="Topai"
                  title="Sąrašai"
                  link={{ href: `/blogas/${blog.slug}?type=topas`, label: 'Visi →' }}
                />
                <TopasCompact blogSlug={blog.slug} posts={topasPosts} />
              </section>
            )}
            {translations.length > 0 && (
              <section>
                <SectionHeader
                  eyebrow="Vertimai"
                  title="Lyrics į lietuvių"
                  meta={`${stats.translate}`}
                />
                <TranslationsCompact translations={translations} blogSlug={blog?.slug} />
              </section>
            )}
          </div>
        )}

        {/* Friends */}
        {friends && friends.length > 0 && (
          <section className="mt-10 sm:mt-14">
            <SectionHeader eyebrow="Bendrabūviai" title="Panašaus skonio nariai" />
            <FriendsAvatarGrid friends={friends} />
          </section>
        )}

        {/* Footer */}
        <ProfileFooter
          profile={profile}
          memberSinceYear={memberSinceYear}
          totalContent={totalContent}
          isLegacy={isLegacy}
          isUnclaimed={isUnclaimed}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline stat chip
// ─────────────────────────────────────────────────────────────────────────────

function InlineStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[.04] border border-white/[.06] text-xs font-bold"
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
      <span className="text-white">{value}</span>
      <span className="text-[#8aa0c0] font-medium">{label}</span>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, meta, link }: {
  eyebrow: string; title: string; meta?: string | null; link?: { href: string; label: string }
}) {
  return (
    <div className="mb-4 sm:mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#f97316] mb-1.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {eyebrow}
        </div>
        <h2 className="font-black tracking-[-0.025em] text-[#f0f2f5] leading-[1.05]" style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}>
          {title}
        </h2>
        {meta && (
          <p className="text-xs text-[#5e7290] mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {meta}
          </p>
        )}
      </div>
      {link && (
        <Link href={link.href} className="text-xs sm:text-sm font-bold text-[#f97316] hover:text-[#fb923c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {link.label}
        </Link>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact mood song (horizontal card, ne full-bleed)
// ─────────────────────────────────────────────────────────────────────────────

function CompactMoodSong({ track, username }: { track: any; username: string }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url

  return (
    <section className="mt-10 sm:mt-12">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#f97316] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Nuotaikos daina
      </div>
      <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group block">
        <div className="relative flex items-center gap-4 sm:gap-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-500/[.08] via-rose-500/[.04] to-transparent border border-orange-500/15 overflow-hidden">
          {/* Backdrop blur on cover */}
          {coverImage && (
            <>
              <div
                aria-hidden
                className="absolute inset-0 -z-10 opacity-60"
                style={{
                  backgroundImage: `url(${coverImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(60px) saturate(1.6) brightness(0.5)',
                  transform: 'scale(1.4)',
                }}
              />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/40 via-black/30 to-black/50" />
            </>
          )}

          {/* Cover with vinyl ring */}
          <div className="relative flex-shrink-0">
            <div
              className="absolute -inset-1.5 rounded-full opacity-40"
              style={{
                background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)',
                animation: 'moodSpinV4 12s linear infinite',
                filter: 'blur(4px)',
              }}
            />
            {coverImage ? (
              <img
                src={coverImage}
                alt=""
                className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-white/15"
                style={{ animation: 'moodSpinV4 30s linear infinite' }}
              />
            ) : (
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-3xl">♬</div>
            )}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#080c12] border border-white/20" />
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-300 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
              ♬ {username} pasirinkimas
            </p>
            <h3
              className="font-extrabold text-white leading-tight tracking-[-0.02em] group-hover:text-orange-300 transition truncate"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}
            >
              {track.title}
            </h3>
            <p className="text-sm sm:text-base text-[#dde8f8] mt-0.5 font-semibold truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {artist?.name || 'Nežinomas atlikėjas'}
            </p>
          </div>
        </div>
      </Link>

      <style>{`@keyframes moodSpinV4 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily picks carousel (kompaktiškesni)
// ─────────────────────────────────────────────────────────────────────────────

function DailyPicksCarousel({ picks }: { picks: any[] }) {
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-3 scrollbar-thin">
      <div className="flex gap-3" style={{ width: 'max-content' }}>
        {picks.map((p: any) => {
          const tracks = Array.isArray(p.tracks) ? p.tracks[0] : p.tracks
          const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
          const trackKnown = !!tracks
          const dateObj = new Date(p.picked_on)
          const day = dateObj.getDate()
          const month = dateObj.toLocaleDateString('lt-LT', { month: 'short' })
          const year = dateObj.getFullYear()

          return (
            <div key={p.id} className="w-[160px] sm:w-[180px] flex-shrink-0">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-[#111822] mb-2">
                {trackKnown && artist?.cover_image_url ? (
                  <Link href={`/atlikejai/${artist.slug}`} className="block group h-full">
                    <img src={artist.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/0" />
                  </Link>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-4xl text-white/10">♪</div>
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
                  <span className="text-[10px] font-extrabold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {day} {month} {year}
                  </span>
                </div>
                {p.like_count > 0 && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-full bg-rose-500/90 backdrop-blur-sm text-[9px] font-extrabold text-white">
                    ♥ {p.like_count}
                  </div>
                )}
              </div>
              <p className="text-xs font-bold text-white truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {trackKnown ? tracks.title : <span className="text-[#5e7290] italic">Neimportuota</span>}
              </p>
              <p className="text-[11px] text-[#8aa0c0] truncate">{trackKnown ? artist?.name : `#${p.legacy_track_id}`}</p>
              {p.comment && (
                <p className="text-[10px] text-[#5e7290] italic mt-1 line-clamp-2 leading-snug">„{p.comment}"</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorite artists — 2-col stacked rows (kompaktiškiau nei aspect-[3/4] cards)
// ─────────────────────────────────────────────────────────────────────────────

function FavoriteArtistsCompact({ artists }: { artists: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {artists.map((a: any) => (
        <Link key={a.id} href={`/atlikejai/${a.slug}`} className="group relative aspect-square rounded-xl overflow-hidden bg-[#111822]">
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-3xl font-black text-white/10" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name[0].toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2.5">
            <p className="text-sm font-extrabold text-white leading-tight truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts compact list (kompaktiškas vienas-zonos sąrašas, ne magazine layout)
// ─────────────────────────────────────────────────────────────────────────────

const POST_TYPE_LABEL: Record<string, string> = {
  article: 'Straipsnis', review: 'Recenzija', event: 'Renginys', creation: 'Kūryba',
  translation: 'Vertimas', topas: 'Topas',
}
const POST_TYPE_COLOR: Record<string, string> = {
  article: '#f97316', review: '#fbbf24', event: '#34d399', creation: '#f472b6',
  translation: '#a78bfa', topas: '#60a5fa',
}

function PostsCompact({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {posts.map((p: any) => (
        <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group flex gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-white/[.1] transition">
          {p.cover_image_url ? (
            <img src={p.cover_image_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gradient-to-br from-orange-500/15 to-rose-600/15 flex-shrink-0 flex items-center justify-center text-2xl text-white/15">{POST_TYPE_LABEL[p.post_type]?.[0] || '?'}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span
                className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  background: `${POST_TYPE_COLOR[p.post_type] || '#5e7290'}25`,
                  color: POST_TYPE_COLOR[p.post_type] || '#b0bdd4',
                  border: `1px solid ${POST_TYPE_COLOR[p.post_type] || '#5e7290'}40`,
                }}
              >
                {POST_TYPE_LABEL[p.post_type] || p.post_type}
              </span>
              {Array.isArray(p.tags) && p.tags.slice(0, 2).map((t: string) => (
                <span key={t} className="text-[9px] font-bold text-[#8aa0c0]">#{t}</span>
              ))}
            </div>
            <h4 className="text-sm font-bold text-white leading-tight line-clamp-2 group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {p.title}
            </h4>
            <p className="text-[10px] text-[#5e7290] mt-1 uppercase tracking-wider font-bold flex gap-2">
              <span>{new Date(p.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {p.like_count > 0 && <span>♥ {p.like_count}</span>}
              {p.comment_count > 0 && <span>💬 {p.comment_count}</span>}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Topas compact
// ─────────────────────────────────────────────────────────────────────────────

function TopasCompact({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {posts.map((p: any) => {
        const items = Array.isArray(p.list_items) ? p.list_items : []
        return (
          <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group block rounded-xl overflow-hidden bg-gradient-to-br from-[#1a2436] to-[#0f1622] border border-white/[.06] hover:border-[#60a5fa]/30 transition">
            <div className="relative aspect-[4/3] overflow-hidden">
              {items.length >= 4 ? (
                <div className="grid grid-cols-2 grid-rows-2 h-full">
                  {items.slice(0, 4).map((it: any, i: number) => (
                    <div key={i} className="bg-[#080c12] overflow-hidden">
                      {it.image_url ? <img src={it.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-base text-white/10">{i + 1}</div>}
                    </div>
                  ))}
                </div>
              ) : p.cover_image_url ? (
                <img src={p.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl text-white/10">📋</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 backdrop-blur-sm text-[9px] font-extrabold uppercase tracking-wider">
                Topas · {items.length || '?'}
              </div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-extrabold text-white leading-tight group-hover:text-[#60a5fa] transition line-clamp-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {p.title}
              </h3>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Translations compact
// ─────────────────────────────────────────────────────────────────────────────

function TranslationsCompact({ translations, blogSlug }: { translations: any[]; blogSlug?: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      {translations.map((t: any) => {
        const slug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
        const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
        const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
        return (
          <Link key={t.id} href={slug ? `/blogas/${slug}/${t.slug}` : '#'}
                className="block p-3.5 rounded-xl bg-gradient-to-br from-violet-500/[.07] to-purple-600/[.04] border border-violet-500/15 hover:border-violet-400/30 transition group">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-violet-300 mb-1.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
              vertimas
            </div>
            <h3 className="text-sm font-bold text-white leading-tight group-hover:text-violet-300 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {t.title}
            </h3>
            {targetArtist && (
              <p className="text-xs text-[#8aa0c0] mt-1">
                {targetArtist.name}
                {targetTrack && <> — <span className="italic">{targetTrack.title}</span></>}
              </p>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Friends
// ─────────────────────────────────────────────────────────────────────────────

function FriendsAvatarGrid({ friends }: { friends: any[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {friends.map((f: any) => (
        <Link key={f.id} href={`/vartotojas/${f.username}`} className="group relative">
          {f.avatar_url ? (
            <img src={f.avatar_url} alt="" className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/[.08] group-hover:border-[#60a5fa]/60 transition" />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-base font-bold text-white/30 border-2 border-white/[.08] group-hover:border-[#60a5fa]/60 transition">
              {(f.full_name || f.username || '?')[0].toUpperCase()}
            </div>
          )}
          {f.is_vip_legacy && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-[#080c12]" title="VIP" />}
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-7 whitespace-nowrap text-[10px] font-bold text-white bg-black/90 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
            {f.full_name || f.username}
          </span>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function ProfileFooter({ profile, memberSinceYear, totalContent, isLegacy, isUnclaimed }: any) {
  return (
    <footer className="mt-16 sm:mt-20 pt-6 border-t border-white/[.05]">
      <p className="text-xs text-[#5e7290] text-center mb-5" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Music.lt narys nuo {memberSinceYear}
        {totalContent > 0 && <> · {totalContent.toLocaleString('lt-LT')} įrašų / dienos dainų</>}
        {profile.legacy_karma_points && <> · {profile.legacy_karma_points.toLocaleString('lt-LT')} reitingo taškų</>}
      </p>
      {isLegacy && isUnclaimed && (
        <div className="max-w-xl mx-auto text-center p-4 rounded-2xl border border-amber-500/15 bg-amber-500/[.04]">
          <p className="text-sm text-[#dde8f8] leading-relaxed mb-2.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span className="font-bold">Tai jūsų profilis?</span> Užsiregistruokite naujoje music.lt sistemoje tuo pačiu email'u — automatiškai sujungsime visą jūsų istoriją.
          </p>
          <Link href="/auth/signin" className="inline-block px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Atgauti accountą
          </Link>
        </div>
      )}
    </footer>
  )
}
