'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// Client view su state — equalizer'is interactive: pasirinkus stylių,
// dešinėje atlikėjų sekcijoje filtruojami tik tos kategorijos atlikėjai.
// Bio paslėpta po „Daugiau apie autorių" expand button'u.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from '@/components/profile/SideEqualizer'
import { FavoriteStylesChips } from '@/components/profile/FavoriteStylesChips'

const POST_TYPE_LABEL: Record<string, string> = {
  article: 'Straipsnis', review: 'Recenzija', event: 'Renginys', creation: 'Kūryba',
  translation: 'Vertimas', topas: 'Topas',
}
const POST_TYPE_COLOR: Record<string, string> = {
  article: '#f97316', review: '#fbbf24', event: '#34d399', creation: '#f472b6',
  translation: '#a78bfa', topas: '#60a5fa',
}

export function ProfileClient(props: any) {
  const {
    profile, favoriteArtists, favoriteStyles, friends, blog,
    regularPosts, topasPosts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
  } = props

  const [bioOpen, setBioOpen] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks
  const heroImage = profile.cover_image_url || profile.avatar_url

  // Filtered artists pagal selectedGenre — match against mainGenres array
  const filteredArtists = useMemo(() => {
    if (!selectedGenre) return favoriteArtists
    return favoriteArtists.filter((a: any) => {
      const genres: { id: number; name: string }[] = a.mainGenres || []
      return genres.some((g) => g.name === selectedGenre)
    })
  }, [favoriteArtists, selectedGenre])

  return (
    <div className="min-h-screen bg-[var(--bg-surface,#080c12)] text-[var(--text-primary,#f0f2f5)]">

      {/* Subtle backdrop */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 max-h-[520px] overflow-hidden">
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

        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10">

          {/* Identity row — 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:gap-8 lg:items-start">

            {/* LEFT — identity */}
            <div className="min-w-0">
              <div className="flex items-center gap-4 sm:gap-5 mb-3">
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
                    <span className="text-[#5e7290]">·</span>
                    <span>nuo {memberSinceYear}</span>
                    {profile.legacy_karma_points && (
                      <>
                        <span className="text-[#5e7290]">·</span>
                        <span className="font-bold text-[#f97316]">{profile.legacy_karma_points.toLocaleString('lt-LT')} t.</span>
                      </>
                    )}
                    {isLegacy && isUnclaimed && (
                      <span className="text-[9px] font-bold text-[#5e7290] uppercase tracking-wider bg-white/[.04] border border-white/[.08] rounded-full px-2 py-0.5">
                        archyvinis
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Inline meta line — minimal */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 text-sm text-[#8aa0c0]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                {stats.daily_picks > 0 && <span><span className="font-bold text-white">{stats.daily_picks.toLocaleString('lt-LT')}</span> dienos dainų</span>}
                {stats.diary > 0 && <span><span className="font-bold text-white">{stats.diary.toLocaleString('lt-LT')}</span> įrašų</span>}
                {stats.comments_received > 0 && <span><span className="font-bold text-white">{stats.comments_received.toLocaleString('lt-LT')}</span> komentarų</span>}
                {friends.length > 0 && <span><span className="font-bold text-white">{friends.length}{friends.length === 24 ? '+' : ''}</span> draugų</span>}
              </div>

              {/* Bio expand button */}
              {profile.bio && (
                <div className="mb-4">
                  <button
                    onClick={() => setBioOpen((o) => !o)}
                    className="text-xs font-bold text-[#8aa0c0] hover:text-white uppercase tracking-wider flex items-center gap-1.5 transition"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {bioOpen ? '▾' : '▸'} {bioOpen ? 'Slėpti aprašymą' : 'Apie autorių'}
                    <span className="text-[#334058] font-normal italic">(iš senos music.lt — gali būti pasenęs)</span>
                  </button>
                  {bioOpen && (
                    <div className="mt-3 p-4 rounded-xl bg-white/[.02] border border-white/[.05] max-w-[680px]">
                      <div className="text-sm text-[#c8d8f0] leading-relaxed whitespace-pre-line" style={{ fontFamily: "'Outfit', sans-serif" }}>
                        {profile.bio}
                      </div>
                      {profile.legacy_signature && (
                        <p className="mt-3 pt-3 border-t border-white/[.05] text-xs text-[#8aa0c0] italic">
                          „{profile.legacy_signature.replace(/^["„]|["""]$/g, '')}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Favorite styles chips (popularity flavored) */}
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
            <div>
              <SideEqualizer
                meter={profile.legacy_music_meter}
                selectedGenre={selectedGenre}
                onSelect={setSelectedGenre}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-12 pb-24">

        {/* Mood song compact */}
        {moodTrack && (
          <CompactMoodSong track={moodTrack} username={profile.full_name || profile.username} />
        )}

        {/* Atlikėjai + Dienos dainos — 2-col (atlikėjai gali būti filtruoti) */}
        <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-10">
          {favoriteArtists.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Mėgstami atlikėjai"
                title={selectedGenre ? `${FULL_TO_SHORT[selectedGenre] || selectedGenre} atlikėjai` : 'Kuria nuotaiką'}
                meta={selectedGenre
                  ? `${filteredArtists.length} iš ${favoriteArtists.length}`
                  : favoriteArtists.length > 8 ? `+${favoriteArtists.length - 8} daugiau` : null
                }
                link={selectedGenre ? { href: '#', label: 'Atstatyti', onClick: () => setSelectedGenre(null) } : undefined}
              />
              {filteredArtists.length > 0 ? (
                <FavoriteArtistsCompact artists={filteredArtists.slice(0, 8)} />
              ) : (
                <div className="p-5 rounded-xl bg-white/[.02] border border-white/[.05] text-center text-sm text-[#5e7290]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  Iš {profile.full_name || profile.username} mėgstamų {favoriteArtists.length} atlikėjų nei vienas dar nepriklauso „{FULL_TO_SHORT[selectedGenre!] || selectedGenre}" stiliui.
                  <br />
                  <span className="text-[#334058]">(Žanro mapping'as pildomas — atlikėjas, neturintis priskirto žanro DB, čia nematomas.)</span>
                </div>
              )}
            </section>
          )}

          {dailyPicks.length > 0 && (
            <section>
              <SectionHeader
                eyebrow="Dienos dainos"
                title="Kasdienis pasirinkimas"
                meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
                link={stats.daily_picks > dailyPicks.length ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
              />
              <DailyPicksList picks={dailyPicks.slice(0, 6)} />
            </section>
          )}
        </div>

        {/* Įrašai + Topai 2-col */}
        {(blog && (regularPosts.length > 0 || topasPosts.length > 0)) && (
          <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            {regularPosts.length > 0 && (
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
            {topasPosts.length > 0 && (
              <section>
                <SectionHeader
                  eyebrow="Topai"
                  title="Mėgstamiausių sąrašai"
                  link={{ href: `/blogas/${blog.slug}?type=topas`, label: 'Visi →' }}
                />
                <TopasCompact blogSlug={blog.slug} posts={topasPosts} />
              </section>
            )}
          </div>
        )}

        {/* Vertimai + Friends 2-col */}
        {(translations.length > 0 || friends.length > 0) && (
          <div className="mt-10 sm:mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
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
            {friends && friends.length > 0 && (
              <section>
                <SectionHeader eyebrow="Bendrabūviai" title="Panašaus skonio nariai" meta={`${friends.length}${friends.length === 24 ? '+' : ''}`} />
                <FriendsAvatarGrid friends={friends} />
              </section>
            )}
          </div>
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
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, meta, link }: {
  eyebrow: string; title: string; meta?: string | null;
  link?: { href: string; label: string; onClick?: () => void }
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
        {meta && <p className="text-xs text-[#5e7290] mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>{meta}</p>}
      </div>
      {link && (link.onClick ? (
        <button onClick={link.onClick} className="text-xs sm:text-sm font-bold text-[#f97316] hover:text-[#fb923c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {link.label}
        </button>
      ) : (
        <Link href={link.href} className="text-xs sm:text-sm font-bold text-[#f97316] hover:text-[#fb923c] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {link.label}
        </Link>
      ))}
    </div>
  )
}

function CompactMoodSong({ track, username }: { track: any; username: string }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url
  return (
    <section>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#f97316] mb-3" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Nuotaikos daina
      </div>
      <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group block">
        <div className="relative flex items-center gap-4 sm:gap-6 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-500/[.08] via-rose-500/[.04] to-transparent border border-orange-500/15 overflow-hidden">
          {coverImage && (
            <>
              <div aria-hidden className="absolute inset-0 -z-10 opacity-60" style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.6) brightness(0.5)', transform: 'scale(1.4)' }} />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/40 via-black/30 to-black/50" />
            </>
          )}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1.5 rounded-full opacity-40" style={{ background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)', animation: 'moodSpinV5 12s linear infinite', filter: 'blur(4px)' }} />
            {coverImage ? (
              <img src={coverImage} alt="" className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-white/15" style={{ animation: 'moodSpinV5 30s linear infinite' }} />
            ) : (
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-3xl">♬</div>
            )}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#080c12] border border-white/20" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-300 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
              ♬ {username} pasirinkimas
            </p>
            <h3 className="font-extrabold text-white leading-tight tracking-[-0.02em] group-hover:text-orange-300 transition truncate" style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}>
              {track.title}
            </h3>
            <p className="text-sm sm:text-base text-[#dde8f8] mt-0.5 font-semibold truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {artist?.name || 'Nežinomas atlikėjas'}
            </p>
          </div>
        </div>
      </Link>
      <style>{`@keyframes moodSpinV5 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}

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

function DailyPicksList({ picks }: { picks: any[] }) {
  return (
    <div className="flex flex-col gap-2">
      {picks.map((p: any) => {
        const tracks = Array.isArray(p.tracks) ? p.tracks[0] : p.tracks
        const artist = tracks ? (Array.isArray(tracks.artists) ? tracks.artists[0] : tracks.artists) : null
        const trackKnown = !!tracks
        const dateObj = new Date(p.picked_on)
        const day = dateObj.getDate()
        const month = dateObj.toLocaleDateString('lt-LT', { month: 'short' })
        const year = dateObj.getFullYear()
        return (
          <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[.02] border border-white/[.04] hover:border-white/[.08] transition">
            <div className="flex-shrink-0 w-14 text-center">
              <div className="text-base font-extrabold text-[#34d399]" style={{ fontFamily: "'Outfit', sans-serif" }}>{day}</div>
              <div className="text-[9px] uppercase tracking-wider text-[#5e7290] font-bold">{month} {year}</div>
            </div>
            {trackKnown && artist?.cover_image_url ? (
              <Link href={`/atlikejai/${artist.slug}`} className="flex-shrink-0">
                <img src={artist.cover_image_url} alt="" className="w-10 h-10 rounded-md object-cover" />
              </Link>
            ) : (
              <div className="w-10 h-10 rounded-md bg-[#111822]/60 flex items-center justify-center text-base text-white/15 flex-shrink-0">♪</div>
            )}
            <div className="min-w-0 flex-1">
              {trackKnown ? (
                <Link href={`/atlikejai/${artist?.slug}`} className="group">
                  <p className="text-sm font-bold text-white truncate group-hover:text-[#34d399] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>{tracks.title}</p>
                  <p className="text-xs text-[#8aa0c0] truncate">{artist?.name}</p>
                </Link>
              ) : (
                <>
                  <p className="text-sm font-medium text-[#5e7290] italic truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>Daina dar neimportuota</p>
                  <p className="text-[10px] text-[#334058]">music.lt #{p.legacy_track_id}</p>
                </>
              )}
              {p.comment && <p className="text-[11px] text-[#8aa0c0] italic mt-0.5 truncate">„{p.comment}"</p>}
            </div>
            {p.like_count > 0 && (
              <div className="flex-shrink-0 text-[10px] text-[#5e7290] font-bold">♥ {p.like_count}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PostsCompact({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {posts.map((p: any) => (
        <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`} className="group flex gap-3 p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-white/[.1] transition">
          {p.cover_image_url ? (
            <img src={p.cover_image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-500/15 to-rose-600/15 flex-shrink-0 flex items-center justify-center text-xl text-white/15">{POST_TYPE_LABEL[p.post_type]?.[0] || '?'}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ fontFamily: "'Outfit', sans-serif", background: `${POST_TYPE_COLOR[p.post_type] || '#5e7290'}25`, color: POST_TYPE_COLOR[p.post_type] || '#b0bdd4', border: `1px solid ${POST_TYPE_COLOR[p.post_type] || '#5e7290'}40` }}>
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
