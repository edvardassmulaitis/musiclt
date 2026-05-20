// app/vartotojas/[username]/page.tsx
//
// Pilnas user profile redesign — cinematic hero + switchable featured slot
// (top atlikėjai / mood player / muzikometras equalizer) + visa user'io
// migracijos info iškloti per full width.
//
// Dizaino inspiracija — atlikėjo profilis (artist-profile-client.tsx):
//   - Cinematic backdrop (avatar blur layer + sharp foreground + gradient overlay)
//   - Outfit font su tight letter spacing
//   - Big hero title + likes + badges
//   - CSS variables tokens
//   - Switchable featured panel dešinėje (vidutiniai ekranai į apačią)
//
// Visi importuoti music.lt nariai (provider='legacy_forum') gauna pilną
// turinio profilį net be claim'o — tai svarbu user reactivation flow:
// jie ateina, mato visa savo istoriją, ir prisijungia.

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
import { ProfileFeaturedSlot } from '@/components/profile/ProfileFeaturedSlot'

type Props = { params: Promise<{ username: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
  if (!profile) return { title: 'Nerastas — music.lt' }
  return {
    title: `${profile.full_name || profile.username} — music.lt`,
    description: profile.bio || `${profile.full_name || username} profilis music.lt`,
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const profile: any = await getProfileByUsername(username)
  if (!profile || !profile.is_public) notFound()

  const [favoriteArtists, favoriteStyles, friends, blog, stats, moodTrack, dailyPicks, translations] = await Promise.all([
    getProfileFavoriteArtists(profile.id),
    getProfileFavoriteStyles(profile.id),
    getProfileFriends(profile.id, 30),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 10),
    getUserTranslations(profile.id, 5),
  ])

  // Latest 6 blog posts (any type)
  let blogPosts: any[] = []
  if (blog) {
    const sb = createAdminClient()
    const { data } = await sb
      .from('blog_posts')
      .select('id, slug, title, summary, cover_image_url, published_at, reading_time_min, like_count, comment_count, post_type, legacy_source')
      .eq('blog_id', blog.id)
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(6)
    blogPosts = data || []
  }

  const memberSinceDate = profile.joined_legacy_at
    ? new Date(profile.joined_legacy_at)
    : new Date(profile.created_at)
  const memberSinceYear = memberSinceDate.getFullYear()
  const memberSinceFull = memberSinceDate.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })

  // Apskaičiuojam metus su platforma
  const yearsOnPlatform = Math.floor(
    (Date.now() - memberSinceDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
  )

  return (
    <ProfileView
      profile={profile}
      favoriteArtists={favoriteArtists}
      favoriteStyles={favoriteStyles}
      friends={friends}
      blog={blog}
      blogPosts={blogPosts}
      memberSinceYear={memberSinceYear}
      memberSinceFull={memberSinceFull}
      yearsOnPlatform={yearsOnPlatform}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────────────────────

function ProfileView({
  profile, favoriteArtists, favoriteStyles, friends, blog, blogPosts,
  memberSinceYear, memberSinceFull, yearsOnPlatform,
  stats, moodTrack, dailyPicks, translations,
}: any) {
  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks
  const heroImage = profile.cover_image_url || profile.avatar_url || null

  return (
    <div className="min-h-screen bg-[var(--bg-surface,#080c12)] text-[var(--text-primary,#f0f2f5)]">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <Hero
        profile={profile}
        heroImage={heroImage}
        stats={stats}
        memberSinceYear={memberSinceYear}
        memberSinceFull={memberSinceFull}
        yearsOnPlatform={yearsOnPlatform}
        totalContent={totalContent}
        favoriteStyles={favoriteStyles}
        moodTrack={moodTrack}
        favoriteArtists={favoriteArtists}
        isLegacy={isLegacy}
        isUnclaimed={isUnclaimed}
      />

      {/* ── BODY ─────────────────────────────────────────────────────── */}
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pb-24">

        {/* Bio + Apie save */}
        {profile.bio && (
          <section className="mt-10 max-w-[760px]">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5e7290] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Apie save
            </h2>
            <div className="text-base text-[#c8d8f0] leading-[1.7] whitespace-pre-line" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {profile.bio}
            </div>
            {profile.legacy_signature && (
              <div className="mt-5 pl-4 border-l-2 border-[#f97316]/40">
                <p className="text-sm text-[#8aa0c0] italic">{profile.legacy_signature}</p>
              </div>
            )}
          </section>
        )}

        {/* Asmeninė info kortelės */}
        {(profile.legacy_birth_date || profile.legacy_occupation || profile.legacy_favorite_books || profile.website) && (
          <section className="mt-10">
            <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5e7290] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Asmeninė informacija
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.legacy_birth_date && (
                <InfoCard
                  icon="🎂"
                  label="Gimimo data"
                  value={new Date(profile.legacy_birth_date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}
                />
              )}
              {profile.legacy_occupation && (
                <InfoCard icon="💼" label="Užsiėmimas" value={profile.legacy_occupation} />
              )}
              {profile.website && (
                <InfoCard
                  icon="🌐"
                  label="Asmeninė svetainė"
                  value={profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  href={profile.website}
                />
              )}
              {profile.legacy_favorite_books && (
                <InfoCard
                  icon="📚"
                  label="Mėgstamos knygos"
                  value={profile.legacy_favorite_books}
                  wide
                />
              )}
            </div>
          </section>
        )}

        {/* Statistika strip */}
        <StatsStrip profile={profile} stats={stats} totalContent={totalContent} />

        {/* Dienos dainos timeline */}
        {dailyPicks.length > 0 && (
          <section className="mt-12">
            <SectionHeader
              title="Dienos dainos"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
              link={{ href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' }}
              accent="#34d399"
            />
            <DailyPicksTimeline picks={dailyPicks} />
          </section>
        )}

        {/* Dienoraščiai (article + journal + topas etc) */}
        {blog && blogPosts.length > 0 && (
          <section className="mt-12">
            <SectionHeader
              title={blog.title || `${profile.username} tinklaraštis`}
              meta={`${stats.diary.toLocaleString('lt-LT')} įrašų`}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi straipsniai →' }}
              accent="#f97316"
            />
            <DiaryGrid blogSlug={blog.slug} posts={blogPosts} />
          </section>
        )}

        {/* Vertimai */}
        {translations.length > 0 && (
          <section className="mt-12">
            <SectionHeader
              title="Vertimai"
              meta={`${stats.translate} vertimai`}
              link={blog ? { href: `/blogas/${blog.slug}?type=translation`, label: 'Visi →' } : undefined}
              accent="#a78bfa"
            />
            <TranslationsGrid translations={translations} blogSlug={blog?.slug} />
          </section>
        )}

        {/* Draugai */}
        {friends && friends.length > 0 && (
          <section className="mt-12">
            <SectionHeader
              title="Draugai"
              meta={`${friends.length}${friends.length === 30 ? '+' : ''} narių`}
              accent="#60a5fa"
            />
            <FriendsGrid friends={friends} />
          </section>
        )}

        {/* Mėgstami atlikėjai (modern profile) */}
        {favoriteArtists.length > 0 && (
          <section className="mt-12">
            <SectionHeader title="Mėgstami atlikėjai" accent="#f472b6" />
            <div className="flex flex-wrap gap-2">
              {favoriteArtists.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="flex items-center gap-2 bg-white/[.03] border border-white/[.06] rounded-xl px-3 py-2 hover:border-white/[.12] hover:bg-white/[.05] transition text-sm font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {a.cover_image_url ? <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
                  {a.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Claim CTA for unclaimed legacy profiles */}
        {isLegacy && isUnclaimed && (
          <section className="mt-16 p-6 sm:p-8 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[.06] to-orange-500/[.04]">
            <h3 className="text-lg font-extrabold text-amber-100 mb-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Tai jūsų profilis?
            </h3>
            <p className="text-sm text-[#b0bdd4] leading-relaxed max-w-2xl">
              Šis archyvinis profilis perkeltas iš senos music.lt versijos.
              Užsiregistruokite naujoje sistemoje tuo pačiu email'u —
              automatiškai susiesime visą jūsų istoriją, dienoraščius,
              vertimus ir dienos dainas su nauju accountu.
            </p>
            <Link href="/auth/signin" className="inline-block mt-4 px-5 py-2.5 rounded-full bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Atgauti accountą
            </Link>
          </section>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────────────────

function Hero({
  profile, heroImage, stats, memberSinceYear, memberSinceFull, yearsOnPlatform,
  totalContent, favoriteStyles, moodTrack, favoriteArtists,
  isLegacy, isUnclaimed,
}: any) {
  return (
    <section className="relative isolate w-full overflow-hidden">
      {/* Cinematic backdrop */}
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
                filter: 'blur(80px) saturate(1.4) brightness(0.55)',
                transform: 'scale(1.3)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[var(--bg-surface,#080c12)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1a2436] via-[#0f1622] to-[#080c12]" />
        )}
      </div>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-16 sm:pt-20 lg:pt-24 pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-8 lg:gap-12 items-end">

          {/* LEFT — Avatar, name, meta */}
          <div className="min-w-0">
            <div className="flex items-end gap-5 mb-6">
              {/* Avatar */}
              <div className="relative">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || profile.username}
                    className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl object-cover border-2 border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                  />
                ) : (
                  <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-5xl font-black text-white/30 border-2 border-white/10">
                    {(profile.full_name || profile.username || '?')[0].toUpperCase()}
                  </div>
                )}
                {profile.is_vip_legacy && (
                  <div className="absolute -top-2 -right-2 px-2.5 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[10px] font-extrabold uppercase tracking-wider shadow-lg">
                    VIP
                  </div>
                )}
              </div>

              {/* Name + meta */}
              <div className="pb-2 min-w-0 flex-1">
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {isLegacy && isUnclaimed && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[.08] text-[#b0bdd4] border border-white/[.1] uppercase tracking-wider">
                      archyvinis
                    </span>
                  )}
                  {profile.legacy_user_id && (
                    <span className="text-[10px] font-mono text-[#5e7290] bg-white/[.04] border border-white/[.06] rounded-md px-2 py-0.5">
                      #{profile.legacy_user_id}
                    </span>
                  )}
                </div>

                <h1
                  className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)]"
                  style={{ fontSize: 'clamp(2rem,4vw,3.5rem)', fontFamily: "'Outfit', sans-serif" }}
                >
                  {profile.full_name || profile.username}
                </h1>
                <p className="text-sm text-[#b0bdd4] mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  @{profile.username}
                  {profile.legacy_age && <> · {profile.legacy_age} m.</>}
                  {profile.legacy_city && <> · {profile.legacy_city}</>}
                  <> · narys nuo {memberSinceYear}</>
                  {yearsOnPlatform > 0 && <> ({yearsOnPlatform} m. su muzika)</>}
                </p>
              </div>
            </div>

            {/* Inline stats — karma + content + comments */}
            <div className="flex flex-wrap gap-2 mb-6">
              {profile.legacy_karma_points !== null && profile.legacy_karma_points !== undefined && (
                <HeroStat label="Reitingo taškai" value={profile.legacy_karma_points.toLocaleString('lt-LT')} accent="#f97316" />
              )}
              {totalContent > 0 && (
                <HeroStat label="Sukurta įrašų" value={totalContent.toLocaleString('lt-LT')} accent="#34d399" />
              )}
              {stats.comments_received > 0 && (
                <HeroStat label="Komentarų gavo" value={stats.comments_received.toLocaleString('lt-LT')} accent="#a78bfa" />
              )}
              {profile.legacy_message_count && (
                <HeroStat label="Žinučių parašė" value={profile.legacy_message_count.toLocaleString('lt-LT')} accent="#60a5fa" />
              )}
            </div>

            {/* Mėgstamų stilių chip cloud */}
            {favoriteStyles && favoriteStyles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {favoriteStyles.map((s: any) => (
                  <span key={s.legacy_style_id} className="text-xs font-bold text-white/90 bg-white/[.08] backdrop-blur-sm border border-white/[.12] rounded-full px-3 py-1 hover:bg-white/[.15] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {s.style_name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — Featured slot (switchable) */}
          <ProfileFeaturedSlot
            moodTrack={moodTrack}
            musicMeter={profile.legacy_music_meter}
            favoriteArtists={favoriteArtists.slice(0, 5)}
          />
        </div>
      </div>
    </section>
  )
}

function HeroStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-3 py-2 rounded-xl bg-white/[.06] backdrop-blur-sm border border-white/[.08]"
         style={{ borderTopColor: accent, borderTopWidth: 2 }}>
      <div className="text-[9px] uppercase tracking-wider text-[#b0bdd4] font-semibold">{label}</div>
      <div className="text-base font-extrabold text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, meta, link, accent }: {
  title: string; meta?: string; link?: { href: string; label: string }; accent?: string
}) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <div className="flex items-baseline gap-2">
        <h2
          className="font-black tracking-[-0.02em] text-[#f0f2f5]"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}
        >
          {title}
        </h2>
        {accent && <span className="w-2 h-2 rounded-full" style={{ background: accent }} />}
      </div>
      {meta && (
        <span className="text-sm font-bold text-[#5e7290]" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {meta}
        </span>
      )}
      {link && (
        <Link href={link.href} className="ml-auto text-sm font-bold text-[#f97316] hover:underline" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {link.label}
        </Link>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Info card
// ─────────────────────────────────────────────────────────────────────────────

function InfoCard({ icon, label, value, href, wide }: { icon: string; label: string; value: string; href?: string; wide?: boolean }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base opacity-70">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-[#5e7290] font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>{label}</span>
      </div>
      <div className="text-sm font-semibold text-[#dde8f8]" style={{ fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </>
  )
  const className = `${wide ? 'sm:col-span-2 lg:col-span-3' : ''} p-4 rounded-xl bg-white/[.03] border border-white/[.05] ${href ? 'hover:border-white/[.12] hover:bg-white/[.05] transition' : ''}`
  if (href) {
    return <a href={href} target="_blank" rel="noopener" className={className}>{inner}</a>
  }
  return <div className={className}>{inner}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats strip
// ─────────────────────────────────────────────────────────────────────────────

function StatsStrip({ profile, stats, totalContent }: any) {
  const cards: { label: string; value: string; suffix?: string; accent: string }[] = []
  if (profile.legacy_login_count) cards.push({ label: 'Buvo prisijungęs', value: profile.legacy_login_count.toLocaleString('lt-LT'), suffix: 'kartų', accent: '#60a5fa' })
  if (profile.legacy_avg_message_len) cards.push({ label: 'Vid. žinutės ilgis', value: Number(profile.legacy_avg_message_len).toFixed(0), suffix: 'simb.', accent: '#a78bfa' })
  if (profile.legacy_vote_avg_track) cards.push({ label: 'Dainų vert. vid.', value: Number(profile.legacy_vote_avg_track).toFixed(2), suffix: '/ 10', accent: '#34d399' })
  if (profile.legacy_vote_avg_album) cards.push({ label: 'Albumų vert. vid.', value: Number(profile.legacy_vote_avg_album).toFixed(2), suffix: '/ 10', accent: '#f472b6' })
  if (profile.legacy_vote_avg_artist) cards.push({ label: 'Grupių vert. vid.', value: Number(profile.legacy_vote_avg_artist).toFixed(2), suffix: '/ 10', accent: '#fbbf24' })
  if (stats.diary) cards.push({ label: 'Dienoraščių', value: stats.diary.toLocaleString('lt-LT'), accent: '#f97316' })
  if (stats.translate) cards.push({ label: 'Vertimų', value: stats.translate.toLocaleString('lt-LT'), accent: '#a78bfa' })
  if (stats.daily_picks) cards.push({ label: 'Dienos dainų', value: stats.daily_picks.toLocaleString('lt-LT'), accent: '#34d399' })

  if (!cards.length) return null

  return (
    <section className="mt-10">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#5e7290] mb-4" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Aktyvumas music.lt platformoje
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="p-4 rounded-xl bg-white/[.03] border border-white/[.05]"
               style={{ borderLeftColor: c.accent, borderLeftWidth: 3 }}>
            <div className="text-[10px] uppercase tracking-wider text-[#5e7290] font-bold mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{c.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-black text-[#f0f2f5]" style={{ fontFamily: "'Outfit', sans-serif" }}>{c.value}</span>
              {c.suffix && <span className="text-[11px] text-[#5e7290] font-semibold">{c.suffix}</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily picks timeline
// ─────────────────────────────────────────────────────────────────────────────

function DailyPicksTimeline({ picks }: { picks: any[] }) {
  return (
    <div className="space-y-2">
      {picks.map((p: any, i: number) => {
        const tracks = Array.isArray(p.tracks) ? p.tracks[0] : p.tracks
        const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
        const trackKnown = !!tracks
        const dateObj = new Date(p.picked_on)
        const day = dateObj.getDate()
        const month = dateObj.toLocaleDateString('lt-LT', { month: 'short' })
        const year = dateObj.getFullYear()

        return (
          <div key={p.id} className="flex gap-4 p-4 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-white/[.08] transition group">
            {/* Date stamp */}
            <div className="flex-shrink-0 w-16 text-center">
              <div className="text-3xl font-black text-[#34d399]" style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#5e7290] font-bold">{month}</div>
              <div className="text-[10px] text-[#334058]">{year}</div>
            </div>

            {/* Track info */}
            <div className="flex-1 min-w-0">
              {trackKnown ? (
                <Link href={`/atlikejai/${artist?.slug}`} className="block">
                  <div className="flex items-center gap-3">
                    {artist?.cover_image_url ? (
                      <img src={artist.cover_image_url} alt="" className="w-14 h-14 rounded-lg object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-[#111822]" />
                    )}
                    <div className="min-w-0">
                      <p className="text-base font-bold truncate group-hover:text-[#34d399] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>{tracks.title}</p>
                      <p className="text-sm text-[#5e7290] truncate">{artist?.name}</p>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-lg bg-[#111822]/50 flex items-center justify-center text-[#334058] text-xl">♪</div>
                  <div>
                    <p className="text-base font-medium text-[#5e7290] italic" style={{ fontFamily: "'Outfit', sans-serif" }}>Daina dar neimportuota</p>
                    <p className="text-xs text-[#334058]">music.lt #{p.legacy_track_id}</p>
                  </div>
                </div>
              )}
              {p.comment && (
                <p className="text-sm text-[#b0bdd4] mt-2 italic leading-relaxed line-clamp-2">„{p.comment}"</p>
              )}
            </div>

            {/* Like count */}
            {p.like_count > 0 && (
              <div className="flex-shrink-0 self-start">
                <div className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-300">
                  ♥ {p.like_count}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Diary grid
// ─────────────────────────────────────────────────────────────────────────────

function DiaryGrid({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {posts.map((p: any) => (
        <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group block rounded-xl overflow-hidden bg-white/[.02] border border-white/[.04] hover:border-white/[.1] transition">
          {p.cover_image_url && (
            <div className="aspect-video overflow-hidden bg-[#111822]">
              <img src={p.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
            </div>
          )}
          <div className="p-4">
            <h3 className="text-base font-bold text-[#f0f2f5] group-hover:text-[#f97316] transition leading-tight line-clamp-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {p.title}
            </h3>
            {p.summary && <p className="text-sm text-[#5e7290] mt-2 line-clamp-2 leading-relaxed">{p.summary}</p>}
            <div className="text-[10px] text-[#334058] mt-3 flex items-center gap-2 uppercase tracking-wider font-bold">
              <span>{new Date(p.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              {p.reading_time_min && <><span>·</span><span>{p.reading_time_min} min</span></>}
              {p.like_count > 0 && <><span>·</span><span>♥ {p.like_count}</span></>}
              {p.comment_count > 0 && <><span>·</span><span>💬 {p.comment_count}</span></>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Translations grid
// ─────────────────────────────────────────────────────────────────────────────

function TranslationsGrid({ translations, blogSlug }: { translations: any[]; blogSlug?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {translations.map((t: any) => {
        const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
        const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
        const slug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
        return (
          <Link
            key={t.id}
            href={slug ? `/blogas/${slug}/${t.slug}` : '#'}
            className="block p-4 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-[#a78bfa]/30 transition group"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/30 flex items-center justify-center text-lg flex-shrink-0">
                ✎
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-[#f0f2f5] group-hover:text-[#a78bfa] transition leading-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {t.title}
                </h3>
                {targetArtist && (
                  <p className="text-xs text-[#5e7290] mt-1">
                    {targetArtist.name}
                    {targetTrack && <> — {targetTrack.title}</>}
                  </p>
                )}
                <div className="text-[10px] text-[#334058] mt-2 uppercase tracking-wider font-bold">
                  {t.published_at && new Date(t.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short' })}
                  {t.comment_count > 0 && <> · 💬 {t.comment_count}</>}
                </div>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Friends grid
// ─────────────────────────────────────────────────────────────────────────────

function FriendsGrid({ friends }: { friends: any[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-3">
      {friends.map((f: any) => (
        <Link key={f.id} href={`/vartotojas/${f.username}`} className="group flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-white/[.1] hover:bg-white/[.04] transition text-center">
          {f.avatar_url ? (
            <img src={f.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-lg font-bold text-white/30">
              {(f.full_name || f.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 w-full">
            <p className="text-xs font-bold text-[#dde8f8] truncate group-hover:text-[#60a5fa] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {f.full_name || f.username}
            </p>
            {f.is_vip_legacy && (
              <span className="inline-block mt-0.5 text-[8px] font-bold text-amber-400 uppercase tracking-wider">VIP</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}
