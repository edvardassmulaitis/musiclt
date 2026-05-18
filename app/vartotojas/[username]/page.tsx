// app/vartotojas/[username]/page.tsx
//
// User profile page. Visi nariai (claimed ir importuoti iš senos music.lt)
// rodomi vienoje vietoje. Importuoti nariai turi `is_claimed=false` ir
// `provider='legacy_forum'` — jiems papildomai rodom legacy meta (VIP statusą,
// karma points, narystės datą sename forume, miestą, „Nuotaikos dainą") ir
// migracijos turinio statistikas (dienoraščių/vertimų/dienos dainų skaičių).
//
// Kai tokio nario tikras owner'is užsiregistruos ir claim'ins accountą,
// is_claimed pasidarys true, bet rodomas content lieka.

import { notFound } from 'next/navigation'
import {
  getProfileByUsername,
  getProfileFavoriteArtists,
  getBlogByUserId,
  getUserContentStats,
  getDailySongPicks,
  getMoodSongTrack,
  getUserTranslations,
} from '@/lib/supabase-blog'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import type { Metadata } from 'next'

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

  const [favoriteArtists, blog, stats, moodTrack, dailyPicks, translations] = await Promise.all([
    getProfileFavoriteArtists(profile.id),
    getBlogByUserId(profile.id),
    getUserContentStats(profile.id),
    getMoodSongTrack(profile.mood_song_track_id ?? null),
    getDailySongPicks(profile.id, 8),
    getUserTranslations(profile.id, 5),
  ])

  // Top 5 diary entries (rodymui under blog header)
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
      .limit(5)
    blogPosts = data || []
  }

  // Pirma rodome legacy joined date jei nuo seno music.lt, kitaip — modern created_at
  const memberSinceDate = profile.joined_legacy_at
    ? new Date(profile.joined_legacy_at)
    : new Date(profile.created_at)
  const memberSince = memberSinceDate.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long' })

  return (
    <ProfileView
      profile={profile}
      favoriteArtists={favoriteArtists}
      blog={blog}
      blogPosts={blogPosts}
      memberSince={memberSince}
      stats={stats}
      moodTrack={moodTrack}
      dailyPicks={dailyPicks}
      translations={translations}
    />
  )
}

function ProfileView({
  profile, favoriteArtists, blog, blogPosts, memberSince,
  stats, moodTrack, dailyPicks, translations,
}: any) {
  const socials = [
    profile.social_twitter && { name: 'X / Twitter', url: profile.social_twitter },
    profile.social_spotify && { name: 'Spotify', url: profile.social_spotify },
    profile.social_youtube && { name: 'YouTube', url: profile.social_youtube },
    profile.social_tiktok && { name: 'TikTok', url: profile.social_tiktok },
    profile.website && { name: 'Svetainė', url: profile.website },
  ].filter(Boolean)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed

  // Suvestinė ar yra ką rodyti
  const hasAnyLegacyMeta = Boolean(
    profile.is_vip_legacy ||
    profile.legacy_karma_points ||
    profile.legacy_city ||
    profile.legacy_age ||
    moodTrack,
  )
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks

  return (
    <div className="min-h-screen bg-[#080c12] text-[#f0f2f5]">
      {/* Hero */}
      <div className="relative h-48 bg-gradient-to-br from-[#111822] to-[#080c12]">
        {profile.cover_image_url && (
          <img src={profile.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080c12] to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-6 -mt-16 relative">
        {/* Avatar + Name */}
        <div className="flex items-end gap-4 mb-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.full_name} className="w-28 h-28 rounded-full border-4 border-[#080c12] object-cover" />
          ) : (
            <div className="w-28 h-28 rounded-full border-4 border-[#080c12] bg-[#111822] flex items-center justify-center text-3xl font-bold text-[#334058]">
              {(profile.full_name || profile.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="pb-2 min-w-0">
            <h1 className="text-2xl font-extrabold flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <span>{profile.full_name || profile.username}</span>
              {profile.is_vip_legacy && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-yellow-500 to-amber-600 text-black uppercase tracking-wider"
                      title="VIP narys sename music.lt">VIP</span>
              )}
              {isLegacy && isUnclaimed && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[.08] text-[#b0bdd4] border border-white/[.06] uppercase tracking-wider"
                      title="Archyvinis narys — laukia owner'io claim'o">archyvinis</span>
              )}
            </h1>
            <p className="text-sm text-[#5e7290]">
              @{profile.username}
              {profile.legacy_age && <> · {profile.legacy_age} m.</>}
              {profile.legacy_city && <> · {profile.legacy_city}</>}
              {' · narys nuo '}{memberSince}
            </p>
          </div>
        </div>

        {/* Legacy meta badges (karma + content counts) */}
        {hasAnyLegacyMeta && (
          <div className="flex flex-wrap gap-2 mb-6">
            {profile.legacy_karma_points !== null && profile.legacy_karma_points !== undefined && (
              <Badge label="Reitingo taškai" value={profile.legacy_karma_points.toLocaleString('lt-LT')} accent="#f97316" />
            )}
            {stats.diary > 0 && <Badge label="Dienoraščiai" value={stats.diary.toString()} accent="#60a5fa" />}
            {stats.translate > 0 && <Badge label="Vertimai" value={stats.translate.toString()} accent="#a78bfa" />}
            {stats.creation > 0 && <Badge label="Kūryba" value={stats.creation.toString()} accent="#f472b6" />}
            {stats.daily_picks > 0 && <Badge label="Dienos dainų" value={stats.daily_picks.toString()} accent="#34d399" />}
            {stats.comments_received > 0 && <Badge label="Komentarų gavo" value={stats.comments_received.toString()} accent="#94a3b8" />}
          </div>
        )}

        {/* Bio */}
        {profile.bio && <p className="text-sm text-[#b0bdd4] leading-relaxed mb-6 max-w-xl">{profile.bio}</p>}

        {/* Socials */}
        {socials.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            {socials.map((s: any) => (
              <a key={s.name} href={s.url} target="_blank" rel="noopener" className="text-xs font-semibold text-[#b0bdd4] bg-white/[.04] border border-white/[.06] rounded-full px-3 py-1.5 hover:bg-white/[.07] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {s.name}
              </a>
            ))}
          </div>
        )}

        {/* Mood song — atskira sekcija žemiau nei badges */}
        {moodTrack && (
          <section className="mb-8">
            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Nuotaikos daina
            </h2>
            <Link href={`/atlikejai/${moodTrack.artists?.slug}`} className="inline-flex items-center gap-3 p-3 rounded-xl border border-white/[.06] bg-white/[.02] hover:border-white/[.1] transition group">
              {moodTrack.artists?.cover_image_url ? (
                <img src={moodTrack.artists.cover_image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-[#111822]" />
              )}
              <div>
                <p className="text-sm font-bold group-hover:text-[#f97316] transition">{moodTrack.title}</p>
                <p className="text-xs text-[#5e7290]">{moodTrack.artists?.name}</p>
              </div>
            </Link>
          </section>
        )}

        {/* Favorite Artists */}
        {favoriteArtists.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>Mėgstami atlikėjai</h2>
            <div className="flex flex-wrap gap-2">
              {favoriteArtists.map((a: any) => (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="flex items-center gap-2 bg-white/[.03] border border-white/[.06] rounded-lg px-3 py-2 hover:border-white/[.1] transition text-sm font-semibold">
                  {a.cover_image_url ? <img src={a.cover_image_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 rounded-full bg-[#111822]" />}
                  {a.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Daily picks — paskutiniai 8, su link'u į pilną archyvą */}
        {dailyPicks.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Dienos dainos
              </h2>
              {stats.daily_picks > 8 && (
                <Link href={`/vartotojas/${profile.username}/dienos-dainos`} className="text-xs text-[#f97316] font-semibold hover:underline">
                  Visa istorija ({stats.daily_picks.toLocaleString('lt-LT')}) →
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {dailyPicks.map((p: any) => (
                <DailyPickCard key={p.id} pick={p} />
              ))}
            </div>
          </section>
        )}

        {/* Translations */}
        {translations.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Vertimai
              </h2>
              {stats.translate > 5 && blog && (
                <Link href={`/blogas/${blog.slug}?type=translation`} className="text-xs text-[#f97316] font-semibold hover:underline">
                  Visi ({stats.translate}) →
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {translations.map((t: any) => {
                const blogSlug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
                return (
                  <Link key={t.id} href={blogSlug ? `/blogas/${blogSlug}/${t.slug}` : '#'} className="block p-3 rounded-lg border border-white/[.04] bg-white/[.02] hover:border-white/[.08] transition group">
                    <h3 className="text-sm font-bold text-[#f0f2f5] group-hover:text-[#a78bfa] transition truncate">{t.title}</h3>
                    {t.target_artist && (
                      <p className="text-xs text-[#5e7290] mt-0.5">
                        {(Array.isArray(t.target_artist) ? t.target_artist[0]?.name : t.target_artist?.name)}
                        {t.target_track && <> — {(Array.isArray(t.target_track) ? t.target_track[0]?.title : t.target_track?.title)}</>}
                      </p>
                    )}
                    <div className="text-[10px] text-[#334058] mt-1">
                      {t.published_at && new Date(t.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric' })}
                      {t.comment_count > 0 && <> · 💬 {t.comment_count}</>}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* Blog Posts (diary/article/review etc) */}
        {blog && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-[#334058]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {blog.title}
              </h2>
              <Link href={`/blogas/${blog.slug}`} className="text-xs text-[#f97316] font-semibold hover:underline">
                Visi straipsniai{stats.diary > 5 ? ` (${stats.diary})` : ''} →
              </Link>
            </div>
            {blogPosts.length > 0 ? (
              <div className="space-y-3">
                {blogPosts.map((p: any) => (
                  <Link key={p.id} href={`/blogas/${blog.slug}/${p.slug}`} className="flex gap-4 p-3 rounded-lg border border-white/[.04] bg-white/[.02] hover:border-white/[.08] transition group">
                    {p.cover_image_url && <img src={p.cover_image_url} alt="" className="w-20 h-14 rounded object-cover flex-shrink-0" />}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#f0f2f5] group-hover:text-[#f97316] transition truncate">{p.title}</h3>
                      {p.summary && <p className="text-xs text-[#5e7290] mt-0.5 line-clamp-2">{p.summary}</p>}
                      <div className="text-[10px] text-[#334058] mt-1 flex items-center gap-2">
                        <span>{new Date(p.published_at).toLocaleDateString('lt-LT')}</span>
                        <span>·</span>
                        <span>{p.reading_time_min || 1} min</span>
                        <span>·</span>
                        <span>♥ {p.like_count}</span>
                        {p.comment_count > 0 && <><span>·</span><span>💬 {p.comment_count}</span></>}
                        {p.legacy_source && (
                          <>
                            <span>·</span>
                            <span className="text-[#5e7290]">{labelForLegacySource(p.legacy_source)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#334058]">Dar nėra straipsnių</p>
            )}
          </section>
        )}

        {/* Footer stats */}
        <div className="text-xs text-[#334058] pb-12 flex flex-wrap items-center gap-x-2">
          {totalContent > 0 && <span>{totalContent.toLocaleString('lt-LT')} įrašų · </span>}
          <span>Narys nuo {memberSince}</span>
          {isLegacy && isUnclaimed && (
            <span className="ml-auto text-[10px] text-[#5e7290] italic">
              Tai yra archyvinis profilis. Jei tai jūs — prisiregistruokite su tuo pačiu email'u, kad atgautumėte savo turinį.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function Badge({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-white/[.03] border border-white/[.05]"
         style={{ borderLeftColor: accent, borderLeftWidth: 3 }}>
      <div className="text-[9px] uppercase tracking-wider text-[#5e7290] font-semibold">{label}</div>
      <div className="text-sm font-bold text-[#f0f2f5]">{value}</div>
    </div>
  )
}

function DailyPickCard({ pick }: { pick: any }) {
  const tracks = Array.isArray(pick.tracks) ? pick.tracks[0] : pick.tracks
  const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
  const dateStr = new Date(pick.picked_on).toLocaleDateString('lt-LT', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  const trackKnown = !!tracks
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-white/[.04] bg-white/[.02]">
      {/* Date */}
      <div className="flex-shrink-0 w-20 pt-1">
        <p className="text-[10px] font-bold uppercase text-[#5e7290] tracking-wider">{dateStr.split(' ').slice(0, 2).join(' ')}</p>
        <p className="text-[10px] text-[#334058]">{new Date(pick.picked_on).getFullYear()}</p>
      </div>
      {/* Track */}
      <div className="flex-1 min-w-0">
        {trackKnown ? (
          <Link href={`/atlikejai/${artist?.slug}`} className="block group">
            <div className="flex items-center gap-3">
              {artist?.cover_image_url ? (
                <img src={artist.cover_image_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-[#111822] flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold truncate group-hover:text-[#34d399] transition">{tracks.title}</p>
                <p className="text-xs text-[#5e7290] truncate">{artist?.name}</p>
              </div>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#111822]/50 flex items-center justify-center text-[#334058] text-xs flex-shrink-0">♪</div>
            <div>
              <p className="text-sm text-[#5e7290] italic">Daina dar neimportuota</p>
              <p className="text-[10px] text-[#334058]">music.lt #{pick.legacy_track_id}</p>
            </div>
          </div>
        )}
        {pick.comment && (
          <p className="text-xs text-[#b0bdd4] mt-2 italic line-clamp-2">„{pick.comment}"</p>
        )}
      </div>
      {/* Like count */}
      {pick.like_count > 0 && (
        <div className="flex-shrink-0 text-xs text-[#5e7290] pt-1">
          ♥ {pick.like_count}
        </div>
      )}
    </div>
  )
}

function labelForLegacySource(src: string): string {
  switch (src) {
    case 'diary':     return 'dienoraštis'
    case 'creation':  return 'kūryba'
    case 'translate': return 'vertimas'
    case 'topas':     return 'topas'
    default:          return src
  }
}
