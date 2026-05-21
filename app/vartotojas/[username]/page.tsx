// app/vartotojas/[username]/page.tsx
//
// Profilis kaip muzikos overview, ne stats dashboard.
// Pagrindinis fokusas: MĖGSTAMA (ne klausoma) muzika — equalizer + stiliai
// + atlikėjai + dienos dainos. Tinklaraštis su tipais ir tagais kaip
// papildomas content layer'is.
//
// V3 dizaino principai:
//   - HERO compact: mažas avatar + name + 1 eilutė meta (ne pilno screen)
//   - MUZIKINIS SKONIS — big working equalizer + expandable stylių chip'ai
//   - NUOTAIKOS DAINA — full-bleed vinyl visual (atskira sekcija)
//   - DIENOS DAINOS — horizontal album cover carousel
//   - MĖGSTAMI ATLIKĖJAI — visual cover grid
//   - ĮRAŠAI (renamed from „Tinklaraštis") — su post type badge + tagais
//   - TOPAI — sava sekcija jei yra
//   - VERTIMAI — atskira sekcija
//   - DRAUGAI — avatarai only
//   - Footer: 1 eilutė meta + claim CTA

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
import { MusicTasteShowcase } from '@/components/profile/MusicTasteShowcase'
import { MoodSongShowcase } from '@/components/profile/MoodSongShowcase'

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
    getUserTranslations(profile.id, 3),
  ])

  // Posts — distinguish topai (kept separate) vs „regular" (article/review/event)
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
    regularPosts = all.filter((p: any) => p.post_type !== 'topas' && p.post_type !== 'translation').slice(0, 6)
    topasPosts = all.filter((p: any) => p.post_type === 'topas').slice(0, 4)
  }

  const memberSinceDate = profile.joined_legacy_at
    ? new Date(profile.joined_legacy_at)
    : new Date(profile.created_at)
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
  regularPosts, topasPosts,
  memberSinceYear, stats, moodTrack, dailyPicks, translations,
}: any) {
  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks

  return (
    <div className="min-h-screen bg-[var(--bg-surface,#080c12)] text-[var(--text-primary,#f0f2f5)]">

      {/* ── 1. COMPACT HERO ────────────────────────────────────────── */}
      <CompactHero
        profile={profile}
        favoriteStyles={favoriteStyles}
        memberSinceYear={memberSinceYear}
        isLegacy={isLegacy}
        isUnclaimed={isUnclaimed}
      />

      {/* ── 2. MUZIKINIS SKONIS — equalizer + expandable stiliai ───── */}
      <div className="mt-6 sm:mt-10">
        <MusicTasteShowcase
          favoriteStyles={favoriteStyles}
          musicMeter={profile.legacy_music_meter}
        />
      </div>

      {/* ── 3. NUOTAIKOS DAINA — full-width vinyl ─────────────────── */}
      {moodTrack && (
        <MoodSongShowcase
          track={moodTrack}
          username={profile.full_name || profile.username}
        />
      )}

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-24">

        {/* ── 4. DIENOS DAINOS — horizontal scroll ────────────────── */}
        {dailyPicks.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Dienos dainos"
              title="Kasdienis pasirinkimas"
              meta={stats.daily_picks > dailyPicks.length ? `${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų istorijoje` : null}
              link={stats.daily_picks > dailyPicks.length ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksCarousel picks={dailyPicks} />
          </section>
        )}

        {/* ── 5. MĖGSTAMI ATLIKĖJAI — visual grid ─────────────────── */}
        {favoriteArtists.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Mėgstami atlikėjai"
              title="Garsai, kurie kuria nuotaiką"
            />
            <FavoriteArtistsVisualGrid artists={favoriteArtists.slice(0, 12)} />
          </section>
        )}

        {/* ── 6. ĮRAŠAI — su post type badges + tagais ─────────────── */}
        {blog && regularPosts.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Tinklaraštis"
              title="Įrašai"
              meta={stats.diary > regularPosts.length ? `${stats.diary.toLocaleString('lt-LT')} įrašų` : null}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi įrašai →' }}
            />
            <PostsLayout blogSlug={blog.slug} posts={regularPosts} />
          </section>
        )}

        {/* ── 7. TOPAI — atskira sekcija ───────────────────────────── */}
        {blog && topasPosts.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Topai"
              title="Mėgstamiausių sąrašai"
              link={{ href: `/blogas/${blog.slug}?type=topas`, label: 'Visi topai →' }}
            />
            <TopasGrid blogSlug={blog.slug} posts={topasPosts} />
          </section>
        )}

        {/* ── 8. VERTIMAI ─────────────────────────────────────────── */}
        {translations.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Vertimai"
              title="Lyrics į lietuvių kalbą"
              meta={`${stats.translate} ${stats.translate === 1 ? 'vertimas' : 'vertimai'}`}
            />
            <TranslationsMinimal translations={translations} blogSlug={blog?.slug} />
          </section>
        )}

        {/* ── 9. DRAUGAI — tik avatarai ────────────────────────────── */}
        {friends && friends.length > 0 && (
          <section className="mt-16 sm:mt-20">
            <SectionHeader
              eyebrow="Bendrabūviai"
              title="Žmonės su panašiu skoniu"
            />
            <FriendsAvatarGrid friends={friends} />
          </section>
        )}

        {/* ── 10. FOOTER — subtle meta ────────────────────────────── */}
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
// HERO — compact identity bar, ne pilno ekrano
// ─────────────────────────────────────────────────────────────────────────────

function CompactHero({ profile, favoriteStyles, memberSinceYear, isLegacy, isUnclaimed }: any) {
  const heroImage = profile.cover_image_url || profile.avatar_url
  const topStyles = (favoriteStyles || []).slice(0, 3).map((s: any) => s.style_name)

  return (
    <section className="relative isolate overflow-hidden">
      {/* Subtle backdrop */}
      <div className="absolute inset-0 -z-10">
        {heroImage ? (
          <>
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${heroImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(80px) saturate(1.6) brightness(0.45)',
                transform: 'scale(1.4)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-[var(--bg-surface,#080c12)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] via-[#0f1622] to-[#080c12]" />
        )}
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-10 sm:pt-14 pb-6 sm:pb-8">
        <div className="flex items-center gap-5 sm:gap-7">
          {/* Avatar — kompaktiškas */}
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
              style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontFamily: "'Outfit', sans-serif" }}
            >
              {profile.full_name || profile.username}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#b0bdd4]" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <span className="font-semibold">@{profile.username}</span>
              {profile.legacy_city && <><span className="text-[#5e7290]">·</span><span>{profile.legacy_city}</span></>}
              {profile.legacy_age && <><span className="text-[#5e7290]">·</span><span>{profile.legacy_age} m.</span></>}
              <span className="text-[#5e7290]">·</span>
              <span>nuo {memberSinceYear}</span>
              {isLegacy && isUnclaimed && (
                <span className="text-[10px] font-bold text-[#5e7290] uppercase tracking-wider bg-white/[.04] border border-white/[.08] rounded-full px-2 py-0.5 ml-1">
                  archyvinis
                </span>
              )}
            </div>
            {topStyles.length > 0 && (
              <p className="mt-2.5 text-sm sm:text-base text-[#dde8f8]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                mėgsta{' '}
                {topStyles.map((s: string, i: number) => (
                  <span key={i}>
                    <span className="font-bold text-white">{s.toLowerCase()}</span>
                    {i < topStyles.length - 2 ? ', ' : i === topStyles.length - 2 ? ' ir ' : ''}
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, meta, link }: {
  eyebrow: string; title: string; meta?: string | null; link?: { href: string; label: string }
}) {
  return (
    <div className="mb-6 sm:mb-8 flex items-end justify-between gap-4 flex-wrap">
      <div>
        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#f97316] mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {eyebrow}
        </div>
        <h2
          className="font-black tracking-[-0.025em] text-[#f0f2f5] leading-[1.05]"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)' }}
        >
          {title}
        </h2>
        {meta && (
          <p className="text-sm text-[#5e7290] mt-1.5" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {meta}
          </p>
        )}
      </div>
      {link && (
        <Link href={link.href} className="text-sm font-bold text-[#f97316] hover:text-[#fb923c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {link.label}
        </Link>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily picks — horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────

function DailyPicksCarousel({ picks }: { picks: any[] }) {
  return (
    <div className="-mx-5 sm:-mx-8 px-5 sm:px-8 overflow-x-auto pb-4 scrollbar-thin">
      <div className="flex gap-3 sm:gap-4" style={{ width: 'max-content' }}>
        {picks.map((p: any) => {
          const tracks = Array.isArray(p.tracks) ? p.tracks[0] : p.tracks
          const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
          const trackKnown = !!tracks
          const dateObj = new Date(p.picked_on)
          const day = dateObj.getDate()
          const month = dateObj.toLocaleDateString('lt-LT', { month: 'short' })
          const year = dateObj.getFullYear()

          return (
            <div key={p.id} className="w-[200px] sm:w-[220px] flex-shrink-0">
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#111822] mb-3">
                {trackKnown && artist?.cover_image_url ? (
                  <Link href={`/atlikejai/${artist.slug}`} className="block group h-full">
                    <img src={artist.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0" />
                  </Link>
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-5xl text-white/10">♪</div>
                )}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                  <div className="text-xs font-extrabold text-white leading-none" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {day} {month}
                  </div>
                  <div className="text-[9px] text-white/60 mt-0.5">{year}</div>
                </div>
                {p.like_count > 0 && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-rose-500/90 backdrop-blur-sm text-[10px] font-extrabold text-white">
                    ♥ {p.like_count}
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-white truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {trackKnown ? tracks.title : <span className="text-[#5e7290] italic">Neimportuota</span>}
                </p>
                <p className="text-xs text-[#8aa0c0] truncate">{trackKnown ? artist?.name : `#${p.legacy_track_id}`}</p>
                {p.comment && (
                  <p className="text-[11px] text-[#5e7290] italic mt-1.5 line-clamp-2 leading-snug">„{p.comment}"</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorite artists — visual grid
// ─────────────────────────────────────────────────────────────────────────────

function FavoriteArtistsVisualGrid({ artists }: { artists: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {artists.map((a: any) => (
        <Link key={a.id} href={`/atlikejai/${a.slug}`} className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#111822]">
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition duration-700" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-6xl font-black text-white/10" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name[0].toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-base font-extrabold text-white leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Posts layout — magazine style su post_type badges + tagais
// ─────────────────────────────────────────────────────────────────────────────

const POST_TYPE_LABEL: Record<string, string> = {
  article: 'Straipsnis',
  review: 'Recenzija',
  event: 'Renginio apžvalga',
  creation: 'Kūryba',
  translation: 'Vertimas',
  topas: 'Topas',
}

const POST_TYPE_COLOR: Record<string, string> = {
  article: '#f97316',
  review: '#fbbf24',
  event: '#34d399',
  creation: '#f472b6',
  translation: '#a78bfa',
  topas: '#60a5fa',
}

function PostsLayout({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  if (!posts.length) return null
  const [hero, ...rest] = posts
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Big featured */}
      <Link href={`/blogas/${blogSlug}/${hero.slug}`} className="lg:col-span-2 group block rounded-2xl overflow-hidden bg-white/[.03] border border-white/[.05] hover:border-white/[.12] transition">
        {hero.cover_image_url ? (
          <div className="aspect-[16/9] overflow-hidden bg-[#111822]">
            <img src={hero.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
          </div>
        ) : (
          <div className="aspect-[16/9] bg-gradient-to-br from-orange-500/20 to-rose-600/20" />
        )}
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span
              className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full"
              style={{
                fontFamily: "'Outfit', sans-serif",
                background: `${POST_TYPE_COLOR[hero.post_type] || '#5e7290'}20`,
                color: POST_TYPE_COLOR[hero.post_type] || '#b0bdd4',
                border: `1px solid ${POST_TYPE_COLOR[hero.post_type] || '#5e7290'}40`,
              }}
            >
              {POST_TYPE_LABEL[hero.post_type] || hero.post_type}
            </span>
            {Array.isArray(hero.tags) && hero.tags.slice(0, 3).map((t: string) => (
              <span key={t} className="text-[10px] font-bold text-[#8aa0c0] bg-white/[.04] border border-white/[.06] rounded-full px-2 py-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
                #{t}
              </span>
            ))}
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {hero.title}
          </h3>
          {hero.summary && <p className="text-sm sm:text-base text-[#b0bdd4] mt-3 line-clamp-2 leading-relaxed">{hero.summary}</p>}
          <div className="text-[10px] text-[#5e7290] mt-4 uppercase tracking-wider font-bold flex gap-3 flex-wrap">
            <span>{new Date(hero.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            {hero.reading_time_min && <span>{hero.reading_time_min} min</span>}
            {hero.like_count > 0 && <span>♥ {hero.like_count}</span>}
            {hero.comment_count > 0 && <span>💬 {hero.comment_count}</span>}
          </div>
        </div>
      </Link>

      {/* Small posts */}
      <div className="flex flex-col gap-3">
        {rest.slice(0, 3).map((p: any) => (
          <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group flex gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-white/[.1] transition">
            {p.cover_image_url ? (
              <img src={p.cover_image_url} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-orange-500/20 to-rose-600/20 flex-shrink-0 flex items-center justify-center text-2xl text-white/20">{POST_TYPE_LABEL[p.post_type]?.[0] || '?'}</div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span
                  className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    background: `${POST_TYPE_COLOR[p.post_type] || '#5e7290'}20`,
                    color: POST_TYPE_COLOR[p.post_type] || '#b0bdd4',
                  }}
                >
                  {POST_TYPE_LABEL[p.post_type] || p.post_type}
                </span>
                {Array.isArray(p.tags) && p.tags.slice(0, 1).map((t: string) => (
                  <span key={t} className="text-[9px] font-bold text-[#5e7290]">#{t}</span>
                ))}
              </div>
              <h4 className="text-sm font-bold text-white leading-tight line-clamp-2 group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {p.title}
              </h4>
              <p className="text-[10px] text-[#5e7290] mt-1.5 uppercase tracking-wider font-bold">
                {new Date(p.published_at).toLocaleDateString('lt-LT', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Topai grid — daugiau visualus negu PostsLayout
// ─────────────────────────────────────────────────────────────────────────────

function TopasGrid({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {posts.map((p: any) => {
        const items = Array.isArray(p.list_items) ? p.list_items : []
        return (
          <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group block rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a2436] to-[#0f1622] border border-white/[.06] hover:border-[#60a5fa]/30 transition">
            {/* Cover collage iš pirmų 4 list_items */}
            <div className="relative aspect-[4/3] overflow-hidden">
              {items.length >= 4 ? (
                <div className="grid grid-cols-2 grid-rows-2 h-full">
                  {items.slice(0, 4).map((it: any, i: number) => (
                    <div key={i} className="bg-[#080c12] overflow-hidden">
                      {it.image_url ? (
                        <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl text-white/10">{i + 1}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : p.cover_image_url ? (
                <img src={p.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-4xl text-white/10">📋</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute top-3 left-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full bg-blue-500/30 text-blue-200 backdrop-blur-sm">
                  Topas · {items.length || '?'}
                </span>
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-base font-extrabold text-white leading-tight group-hover:text-[#60a5fa] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {p.title}
              </h3>
              <div className="text-[10px] text-[#5e7290] mt-2 uppercase tracking-wider font-bold">
                {new Date(p.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short' })}
                {p.like_count > 0 && <> · ♥ {p.like_count}</>}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Translations
// ─────────────────────────────────────────────────────────────────────────────

function TranslationsMinimal({ translations, blogSlug }: { translations: any[]; blogSlug?: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {translations.map((t: any) => {
        const slug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
        const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
        const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
        return (
          <Link key={t.id} href={slug ? `/blogas/${slug}/${t.slug}` : '#'}
                className="block p-5 rounded-2xl bg-gradient-to-br from-violet-500/[.07] to-purple-600/[.04] border border-violet-500/15 hover:border-violet-400/30 transition group">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-300 mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
              vertimas
            </div>
            <h3 className="text-lg font-bold text-white leading-tight group-hover:text-violet-300 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {t.title}
            </h3>
            {targetArtist && (
              <p className="text-sm text-[#8aa0c0] mt-2">
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
// Friends — avatar grid
// ─────────────────────────────────────────────────────────────────────────────

function FriendsAvatarGrid({ friends }: { friends: any[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {friends.map((f: any) => (
        <Link key={f.id} href={`/vartotojas/${f.username}`} className="group relative">
          {f.avatar_url ? (
            <img src={f.avatar_url} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-white/[.08] group-hover:border-[#60a5fa]/60 transition" />
          ) : (
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-lg font-bold text-white/30 border-2 border-white/[.08] group-hover:border-[#60a5fa]/60 transition">
              {(f.full_name || f.username || '?')[0].toUpperCase()}
            </div>
          )}
          {f.is_vip_legacy && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#080c12]" title="VIP" />
          )}
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
    <footer className="mt-24 pt-8 border-t border-white/[.05]">
      <p className="text-xs text-[#5e7290] text-center mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Music.lt narys nuo {memberSinceYear}
        {totalContent > 0 && <> · {totalContent.toLocaleString('lt-LT')} įrašų / dienos dainų</>}
        {profile.legacy_karma_points && <> · {profile.legacy_karma_points.toLocaleString('lt-LT')} reitingo taškų</>}
      </p>
      {isLegacy && isUnclaimed && (
        <div className="max-w-xl mx-auto text-center p-5 rounded-2xl border border-amber-500/15 bg-amber-500/[.04]">
          <p className="text-sm text-[#dde8f8] leading-relaxed mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span className="font-bold">Tai jūsų profilis?</span> Užsiregistruokite naujoje music.lt sistemoje tuo pačiu email'u — automatiškai sujungsime visą jūsų istoriją.
          </p>
          <Link href="/auth/signin" className="inline-block px-5 py-2 rounded-full bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Atgauti accountą
          </Link>
        </div>
      )}
    </footer>
  )
}
