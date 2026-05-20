// app/vartotojas/[username]/page.tsx
//
// Shareable music identity profile — ne stats dashboard'as, o muzikos overview.
// Žmogus turi norėti šito profilio link'ą įmesti į savo IG bio. Tuo tikslu:
//
//   1. Vizualinis fokusas — covers art, gradient'ai, big type
//   2. Mažiau teksto, daugiau jausmo
//   3. Stats — tik subtle apačios eilutė, ne kortelių grid
//   4. „Listening Identity" — poster-style hero su top 3 stiliais didelėmis
//      raidėmis ir equalizer'iu atgalyje
//   5. Mood song — full-width vinyl-style block
//   6. Recent picks — horizontal scroll su album covers
//   7. Latest diary excerpt — 1 featured kortelė su cover
//   8. Friends — tik avatarai, hover'is parodo vardą
//
// Personality reveal'as = MUSIC IDENTITY (stiliai + cover'ai), o ne
// activity metrics (login count etc).

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
import { ListeningIdentity } from '@/components/profile/ListeningIdentity'
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

  // Latest 3 blog posts (featured) + few more for grid (later)
  let blogPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count, comment_count, post_type')
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(4)
    blogPosts = data || []
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
      blogPosts={blogPosts}
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
  profile, favoriteArtists, favoriteStyles, friends, blog, blogPosts,
  memberSinceYear, stats, moodTrack, dailyPicks, translations,
}: any) {
  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const heroImage = profile.cover_image_url || profile.avatar_url || null
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks

  // Pull-quote — pirmoji bio sakinis arba signature, jei trumpas
  const pullQuote = profile.legacy_signature && profile.legacy_signature.length < 180
    ? profile.legacy_signature
    : null

  return (
    <div className="min-h-screen bg-[var(--bg-surface,#080c12)] text-[var(--text-primary,#f0f2f5)]">

      {/* ── 1. HERO — cinematic, identity card ──────────────────────── */}
      <Hero
        profile={profile}
        heroImage={heroImage}
        memberSinceYear={memberSinceYear}
        favoriteStyles={favoriteStyles}
        isLegacy={isLegacy}
        isUnclaimed={isUnclaimed}
      />

      {/* ── 2. LISTENING IDENTITY — poster-style top styles ─────────── */}
      {(favoriteStyles && favoriteStyles.length > 0) || (profile.legacy_music_meter && profile.legacy_music_meter.length > 0) ? (
        <ListeningIdentity
          favoriteStyles={favoriteStyles}
          musicMeter={profile.legacy_music_meter}
          username={profile.username}
        />
      ) : null}

      {/* ── 3. MOOD SONG — full-width vinyl showcase ────────────────── */}
      {moodTrack && (
        <MoodSongShowcase
          track={moodTrack}
          username={profile.full_name || profile.username}
        />
      )}

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-24">

        {/* ── 4. PULL QUOTE — vienas sakinys, didelis ──────────────── */}
        {pullQuote && (
          <section className="my-16 sm:my-24 text-center">
            <p
              className="font-black tracking-[-0.02em] text-white/90 leading-[1.15] max-w-3xl mx-auto"
              style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.5rem, 4vw, 2.75rem)' }}
            >
              <span className="text-[#f97316]/40 text-4xl align-top mr-2">"</span>
              {pullQuote.replace(/^["„]|["""]$/g, '')}
              <span className="text-[#f97316]/40 text-4xl align-top ml-2">"</span>
            </p>
          </section>
        )}

        {/* ── 5. DAILY PICKS — horizontal album cover scroll ──────── */}
        {dailyPicks.length > 0 && (
          <section className="mt-20">
            <SectionHeader
              eyebrow="Dienos dainos"
              title="Ką klausė šis žmogus"
              meta={stats.daily_picks > dailyPicks.length ? `${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų istorijoje` : null}
              link={stats.daily_picks > dailyPicks.length ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksCarousel picks={dailyPicks} />
          </section>
        )}

        {/* ── 6. FAVORITE ARTISTS — visual grid su cover'ais ──────── */}
        {favoriteArtists.length > 0 && (
          <section className="mt-20">
            <SectionHeader
              eyebrow="Mėgstami atlikėjai"
              title="Garsai, kurie kuria nuotaiką"
            />
            <FavoriteArtistsVisualGrid artists={favoriteArtists.slice(0, 12)} />
          </section>
        )}

        {/* ── 7. FEATURED WRITING — 1 didelė kortelė + 2 mažos ─── */}
        {blog && blogPosts.length > 0 && (
          <section className="mt-20">
            <SectionHeader
              eyebrow="Tinklaraštis"
              title="Apie muziką, jo žodžiais"
              meta={stats.diary > blogPosts.length ? `${stats.diary.toLocaleString('lt-LT')} įrašų` : null}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi įrašai →' }}
            />
            <FeaturedWritingLayout blogSlug={blog.slug} posts={blogPosts} />
          </section>
        )}

        {/* ── 8. TRANSLATIONS — minimal showcase ────────────────── */}
        {translations.length > 0 && (
          <section className="mt-20">
            <SectionHeader
              eyebrow="Vertimai"
              title="Lyrics į lietuvių kalbą"
              meta={`${stats.translate} ${stats.translate === 1 ? 'vertimas' : 'vertimai'}`}
            />
            <TranslationsMinimal translations={translations} blogSlug={blog?.slug} />
          </section>
        )}

        {/* ── 9. FRIENDS — only avatars, no metadata ─────────────── */}
        {friends && friends.length > 0 && (
          <section className="mt-20">
            <SectionHeader
              eyebrow="Bendrabūviai"
              title="Žmonės, su kuriais sutinka tonas"
            />
            <FriendsAvatarGrid friends={friends} />
          </section>
        )}

        {/* ── 10. PROFILE FOOTER — subtle, ne stats dashboard ──── */}
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
// HERO — cinematic identity card
// ─────────────────────────────────────────────────────────────────────────────

function Hero({ profile, heroImage, memberSinceYear, favoriteStyles, isLegacy, isUnclaimed }: any) {
  // Top 3 styles as subtitle
  const topStyles = (favoriteStyles || []).slice(0, 3).map((s: any) => s.style_name)

  return (
    <section className="relative isolate w-full overflow-hidden">
      {/* Cinematic blurred backdrop */}
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
                filter: 'blur(100px) saturate(1.6) brightness(0.45)',
                transform: 'scale(1.4)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-[var(--bg-surface,#080c12)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] via-[#0f1622] to-[#080c12]" />
        )}
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-12 sm:pb-16">
        <div className="flex flex-col items-center text-center">

          {/* Avatar */}
          <div className="relative mb-6">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || profile.username}
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-full object-cover border-4 border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
              />
            ) : (
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-6xl font-black text-white/30 border-4 border-white/10">
                {(profile.full_name || profile.username || '?')[0].toUpperCase()}
              </div>
            )}
            {profile.is_vip_legacy && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[10px] font-extrabold uppercase tracking-wider shadow-lg">
                VIP
              </div>
            )}
          </div>

          {/* Name */}
          <h1
            className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] mb-3"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 5rem)', fontFamily: "'Outfit', sans-serif" }}
          >
            {profile.full_name || profile.username}
          </h1>

          {/* Top styles subtitle — much more identity than @username */}
          {topStyles.length > 0 ? (
            <p className="text-base sm:text-lg text-[#dde8f8] max-w-2xl mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
              klauso{' '}
              {topStyles.map((s: string, i: number) => (
                <span key={i}>
                  <span className="font-bold text-white">{s.toLowerCase()}</span>
                  {i < topStyles.length - 2 ? ', ' : i === topStyles.length - 2 ? ' ir ' : ''}
                </span>
              ))}
            </p>
          ) : profile.bio ? (
            <p className="text-base text-[#b0bdd4] max-w-xl mb-4 line-clamp-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {profile.bio.split('\n')[0]}
            </p>
          ) : null}

          {/* Subtle meta line */}
          <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1 text-xs text-[#8aa0c0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span>@{profile.username}</span>
            {profile.legacy_city && <><span className="opacity-40">·</span><span>{profile.legacy_city}</span></>}
            <span className="opacity-40">·</span>
            <span>nuo {memberSinceYear}</span>
            {isLegacy && isUnclaimed && (
              <>
                <span className="opacity-40">·</span>
                <span className="text-[#5e7290]">archyvinis profilis</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header — magazine style
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
// Daily picks — horizontal scroll album cover carousel
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
                {/* Date overlay top-left */}
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
                  <div className="text-xs font-extrabold text-white leading-none" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {day} {month}
                  </div>
                  <div className="text-[9px] text-white/60 mt-0.5">{year}</div>
                </div>
                {/* Like count bottom-right */}
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
// Favorite artists — visual grid w/ cover art
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
// Featured writing — magazine layout 1 big + 3 small
// ─────────────────────────────────────────────────────────────────────────────

function FeaturedWritingLayout({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
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
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#f97316] mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {hero.post_type === 'review' ? 'Recenzija' : hero.post_type === 'event' ? 'Renginio apžvalga' : 'Įrašas'}
          </div>
          <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {hero.title}
          </h3>
          {hero.summary && <p className="text-sm sm:text-base text-[#b0bdd4] mt-3 line-clamp-2 leading-relaxed">{hero.summary}</p>}
          <div className="text-[10px] text-[#5e7290] mt-4 uppercase tracking-wider font-bold flex gap-3">
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
              <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-orange-500/20 to-rose-600/20 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
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
// Translations — minimal
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
// Friends — avatar-only grid, hover reveals name
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
          {/* Tooltip on hover */}
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-7 whitespace-nowrap text-[10px] font-bold text-white bg-black/90 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
            {f.full_name || f.username}
          </span>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile footer — subtle, single line of meta
// ─────────────────────────────────────────────────────────────────────────────

function ProfileFooter({ profile, memberSinceYear, totalContent, isLegacy, isUnclaimed }: any) {
  return (
    <footer className="mt-24 pt-8 border-t border-white/[.05]">
      {/* One-liner subtle stats */}
      <p className="text-xs text-[#5e7290] text-center mb-6" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Music.lt narys nuo {memberSinceYear}
        {totalContent > 0 && <> · {totalContent.toLocaleString('lt-LT')} įrašų / dienos dainų</>}
        {profile.legacy_karma_points && <> · {profile.legacy_karma_points.toLocaleString('lt-LT')} reitingo taškų</>}
      </p>

      {/* Claim CTA if applicable */}
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
