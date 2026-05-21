'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// V6 — dashboard atskaita su 50/50 hero (identity + dideliu equalizer'iu),
// CSS variables visur (light/dark parity), dienos dainos kaip vizualios
// kortelės su covers ir mėnesio gradient'u, equalizer click atveria
// filtruojamą drawer panel'į žemiau su atlikėjais + dienos dainomis.

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from '@/components/profile/SideEqualizer'
import { FavoriteStylesChips } from '@/components/profile/FavoriteStylesChips'
import { DailyPicksCards } from '@/components/profile/DailyPicksCards'

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
  const filterRef = useRef<HTMLDivElement>(null)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks
  const heroImage = profile.cover_image_url || profile.avatar_url

  // Filtered artists pagal selectedGenre — match against mainGenres
  const filteredArtists = useMemo(() => {
    if (!selectedGenre) return favoriteArtists
    return favoriteArtists.filter((a: any) => {
      const genres: { id: number; name: string }[] = a.mainGenres || []
      return genres.some((g) => g.name === selectedGenre)
    })
  }, [favoriteArtists, selectedGenre])

  // Filtered dienos dainos — kai pasirinktas stiliaus, žiūrim į track.artistMainGenres
  const filteredPicks = useMemo(() => {
    if (!selectedGenre) return dailyPicks
    return dailyPicks.filter((p: any) => {
      if (!p.tracks) return false
      const genres: { id: number; name: string }[] = p.tracks.artistMainGenres || []
      return genres.some((g) => g.name === selectedGenre)
    })
  }, [dailyPicks, selectedGenre])

  const handleSelectGenre = (g: string | null) => {
    setSelectedGenre(g)
    // Po short delay'aus — scroll to filtruotai sekcijai
    if (g) {
      setTimeout(() => filterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>

      {/* ═════════════════ HERO — 50/50 split ═════════════════ */}
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
                  filter: 'blur(80px) saturate(1.6) brightness(0.35)',
                  transform: 'scale(1.4)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[var(--bg-body)]" />
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1a2436 0%, #0f1622 50%, var(--bg-body) 100%)' }} />
          )}
        </div>

        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8 sm:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">

            {/* LEFT — Identity */}
            <div className="min-w-0">
              <div className="flex items-start gap-4 sm:gap-5 mb-4">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name || profile.username}
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
                      style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)' }}
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-4xl sm:text-5xl font-black border-2 border-white/10"
                         style={{ color: 'rgba(255,255,255,0.3)' }}>
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
                    style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.75rem)', fontFamily: "'Outfit', sans-serif" }}
                  >
                    {profile.full_name || profile.username}
                  </h1>
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs sm:text-sm"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.78)' }}
                  >
                    <span className="font-semibold">@{profile.username}</span>
                    {profile.legacy_city && <><span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span><span>{profile.legacy_city}</span></>}
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
                    <span>nuo {memberSinceYear}</span>
                    {isLegacy && isUnclaimed && (
                      <span className="text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                            style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        archyvinis
                      </span>
                    )}
                  </div>

                  {/* Karma chip + stats inline */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {profile.legacy_karma_points && (
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold"
                        style={{
                          fontFamily: "'Outfit', sans-serif",
                          background: 'rgba(249,115,22,0.22)',
                          color: '#fdba74',
                          border: '1px solid rgba(249,115,22,0.4)',
                        }}
                      >
                        ★ {profile.legacy_karma_points.toLocaleString('lt-LT')} t.
                      </span>
                    )}
                    <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: "'Outfit', sans-serif" }}>
                      {stats.daily_picks > 0 && <><span className="text-white font-extrabold">{stats.daily_picks.toLocaleString('lt-LT')}</span> dienos dainų</>}
                      {stats.diary > 0 && <> · <span className="text-white font-extrabold">{stats.diary}</span> įrašų</>}
                      {friends.length > 0 && <> · <span className="text-white font-extrabold">{friends.length}{friends.length === 24 ? '+' : ''}</span> draugų</>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bio expand */}
              {profile.bio && (
                <div className="mb-4">
                  <button
                    onClick={() => setBioOpen((o) => !o)}
                    className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition hover:text-white"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.6)' }}
                  >
                    {bioOpen ? '▾' : '▸'} {bioOpen ? 'Slėpti aprašymą' : 'Apie autorių'}
                    <span className="italic font-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      (iš senos music.lt — gali būti pasenęs)
                    </span>
                  </button>
                  {bioOpen && (
                    <div
                      className="mt-3 p-4 rounded-xl max-w-[680px]"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                    >
                      <div
                        className="text-sm leading-relaxed whitespace-pre-line"
                        style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.88)' }}
                      >
                        {profile.bio}
                      </div>
                      {profile.legacy_signature && (
                        <p
                          className="mt-3 pt-3 text-xs italic"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.65)' }}
                        >
                          „{profile.legacy_signature.replace(/^["„]|["""]$/g, '')}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Stiliai cloud */}
              {favoriteStyles && favoriteStyles.length > 0 && (
                <div>
                  <div
                    className="text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2.5"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.55)' }}
                  >
                    Mėgstamiausi stiliai
                  </div>
                  <FavoriteStylesChips styles={favoriteStyles} />
                </div>
              )}
            </div>

            {/* RIGHT — Big equalizer */}
            <div className="min-w-0">
              <SideEqualizer
                meter={profile.legacy_music_meter}
                selectedGenre={selectedGenre}
                onSelect={handleSelectGenre}
                variant="hero"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════ Filtered drawer (kai pasirinktas stilius) ═════════════════ */}
      {selectedGenre && (
        <section
          ref={filterRef}
          className="border-y"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
              <div>
                <div
                  className="text-[10px] font-extrabold uppercase tracking-[0.22em] mb-1.5"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
                >
                  Filtruota pagal stilių
                </div>
                <h2
                  className="font-black tracking-[-0.025em] leading-tight"
                  style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', color: 'var(--text-primary)' }}
                >
                  „{FULL_TO_SHORT[selectedGenre] || selectedGenre}" muzika
                </h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                  {filteredArtists.length} atlikėjų · {filteredPicks.length} dienos dainų
                </p>
              </div>
              <button
                onClick={() => setSelectedGenre(null)}
                className="text-xs font-bold uppercase tracking-wider transition hover:opacity-80 px-3 py-2 rounded-full"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-secondary)',
                }}
              >
                ✕ Atstatyti filtrą
              </button>
            </div>

            {filteredArtists.length > 0 ? (
              <div className="mb-8">
                <div
                  className="text-[10px] font-extrabold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
                >
                  Atlikėjai
                </div>
                <FavoriteArtistsCompact artists={filteredArtists.slice(0, 12)} />
              </div>
            ) : (
              <div
                className="mb-8 p-5 rounded-xl text-center text-sm"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Iš mėgstamų {favoriteArtists.length} atlikėjų nei vienas dar nepriklauso „{FULL_TO_SHORT[selectedGenre] || selectedGenre}" stiliui.
                <br />
                <span style={{ color: 'var(--text-faint)' }}>
                  (Žanro mapping'as pildomas — atlikėjas, neturintis priskirto pagrindinio stiliaus DB, čia nematomas.)
                </span>
              </div>
            )}

            {filteredPicks.length > 0 && (
              <div>
                <div
                  className="text-[10px] font-extrabold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}
                >
                  Dienos dainos
                </div>
                <DailyPicksCards picks={filteredPicks.slice(0, 9)} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═════════════════ Body ═════════════════ */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-24">

        {/* Mood song */}
        {moodTrack && (
          <CompactMoodSong track={moodTrack} username={profile.full_name || profile.username} />
        )}

        {/* Atlikėjai */}
        {!selectedGenre && favoriteArtists.length > 0 && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Mėgstami atlikėjai"
              title="Kuria nuotaiką"
              meta={favoriteArtists.length > 8 ? `+${favoriteArtists.length - 8} daugiau` : null}
            />
            <FavoriteArtistsCompact artists={favoriteArtists.slice(0, 8)} />
          </section>
        )}

        {/* Dienos dainos — VISUAL CARDS */}
        {!selectedGenre && dailyPicks.length > 0 && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Dienos dainos"
              title="Kasdienis pasirinkimas"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
              link={stats.daily_picks > 9 ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksCards picks={dailyPicks.slice(0, 9)} />
          </section>
        )}

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
                <TranslationsCompact translations={translations} />
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
// Subcomponents — viskas per CSS variables, light/dark parity
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title, meta, link }: {
  eyebrow: string; title: string; meta?: string | null;
  link?: { href: string; label: string; onClick?: () => void }
}) {
  return (
    <div className="mb-4 sm:mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div
          className="text-[10px] font-extrabold uppercase tracking-[0.2em] mb-1.5"
          style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
        >
          {eyebrow}
        </div>
        <h2
          className="font-black tracking-[-0.025em] leading-[1.05]"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)', color: 'var(--text-primary)' }}
        >
          {title}
        </h2>
        {meta && (
          <p className="text-xs mt-1" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
            {meta}
          </p>
        )}
      </div>
      {link && (link.onClick ? (
        <button onClick={link.onClick} className="text-xs sm:text-sm font-bold transition hover:opacity-80"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
          {link.label}
        </button>
      ) : (
        <Link href={link.href} className="text-xs sm:text-sm font-bold transition hover:opacity-80"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
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
      <div
        className="text-[10px] font-extrabold uppercase tracking-[0.2em] mb-3"
        style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
      >
        Nuotaikos daina
      </div>
      <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group block">
        <div
          className="relative flex items-center gap-4 sm:gap-6 p-4 sm:p-5 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(to right, rgba(249,115,22,0.10), rgba(244,114,182,0.05), transparent)',
            border: '1px solid rgba(249,115,22,0.18)',
          }}
        >
          {coverImage && (
            <>
              <div aria-hidden className="absolute inset-0 -z-10 opacity-60"
                   style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.6) brightness(0.5)', transform: 'scale(1.4)' }} />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/40 via-black/30 to-black/50" />
            </>
          )}
          <div className="relative flex-shrink-0">
            <div
              className="absolute -inset-1.5 rounded-full opacity-40"
              style={{ background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)', animation: 'moodSpinV6 12s linear infinite', filter: 'blur(4px)' }}
            />
            {coverImage ? (
              <img src={coverImage} alt="" className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-white/15"
                   style={{ animation: 'moodSpinV6 30s linear infinite' }} />
            ) : (
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-3xl">♬</div>
            )}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 rounded-full border border-white/20"
                 style={{ background: 'var(--bg-body)' }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-300 mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
              ♬ {username} pasirinkimas
            </p>
            <h3 className="font-extrabold text-white leading-tight tracking-[-0.02em] group-hover:text-orange-300 transition truncate"
                style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)' }}>
              {track.title}
            </h3>
            <p className="text-sm sm:text-base mt-0.5 font-semibold truncate"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.85)' }}>
              {artist?.name || 'Nežinomas atlikėjas'}
            </p>
          </div>
        </div>
      </Link>
      <style>{`@keyframes moodSpinV6 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}

function FavoriteArtistsCompact({ artists }: { artists: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {artists.map((a: any) => (
        <Link key={a.id} href={`/atlikejai/${a.slug}`}
              className="group relative aspect-square rounded-xl overflow-hidden"
              style={{ background: 'var(--card-surface, var(--bg-elevated))' }}>
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-3xl font-black"
                 style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.12)' }}>
              {a.name[0].toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3">
            <p className="text-sm font-extrabold text-white leading-tight truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function PostsCompact({ blogSlug, posts }: { blogSlug: string; posts: any[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {posts.map((p: any) => (
        <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`}
              className="group flex gap-3 p-3 rounded-xl transition"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
              }}>
          {p.cover_image_url ? (
            <img src={p.cover_image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-500/15 to-rose-600/15 flex-shrink-0 flex items-center justify-center text-xl"
                 style={{ color: 'var(--text-faint)' }}>
              {POST_TYPE_LABEL[p.post_type]?.[0] || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      background: `${POST_TYPE_COLOR[p.post_type] || '#5e7290'}25`,
                      color: POST_TYPE_COLOR[p.post_type] || 'var(--text-secondary)',
                      border: `1px solid ${POST_TYPE_COLOR[p.post_type] || 'var(--border-default)'}40`,
                    }}>
                {POST_TYPE_LABEL[p.post_type] || p.post_type}
              </span>
              {Array.isArray(p.tags) && p.tags.slice(0, 2).map((t: string) => (
                <span key={t} className="text-[9px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  #{t}
                </span>
              ))}
            </div>
            <h4 className="text-sm font-bold leading-tight line-clamp-2 group-hover:opacity-80 transition"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
              {p.title}
            </h4>
            <p className="text-[10px] mt-1 uppercase tracking-wider font-bold flex gap-2"
               style={{ color: 'var(--text-faint)' }}>
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
          <Link key={p.id} href={`/blogas/${blogSlug}/${p.slug}`}
                className="group block rounded-xl overflow-hidden transition"
                style={{
                  background: 'var(--card-surface, var(--bg-elevated))',
                  border: '1px solid var(--border-subtle)',
                }}>
            <div className="relative aspect-[4/3] overflow-hidden">
              {items.length >= 4 ? (
                <div className="grid grid-cols-2 grid-rows-2 h-full">
                  {items.slice(0, 4).map((it: any, i: number) => (
                    <div key={i} className="overflow-hidden" style={{ background: 'var(--bg-body)' }}>
                      {it.image_url
                        ? <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-base" style={{ color: 'var(--text-faint)' }}>{i + 1}</div>}
                    </div>
                  ))}
                </div>
              ) : p.cover_image_url ? (
                <img src={p.cover_image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color: 'var(--text-faint)' }}>📋</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-full backdrop-blur-sm text-[9px] font-extrabold uppercase tracking-wider"
                   style={{ background: 'rgba(59,130,246,0.3)', color: '#dbeafe' }}>
                Topas · {items.length || '?'}
              </div>
            </div>
            <div className="p-3">
              <h3 className="text-sm font-extrabold leading-tight group-hover:opacity-80 transition line-clamp-2"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {p.title}
              </h3>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function TranslationsCompact({ translations }: { translations: any[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {translations.map((t: any) => {
        const slug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
        const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
        const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
        return (
          <Link key={t.id} href={slug ? `/blogas/${slug}/${t.slug}` : '#'}
                className="block p-3.5 rounded-xl transition group"
                style={{
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(168,85,247,0.04))',
                  border: '1px solid rgba(139,92,246,0.18)',
                }}>
            <div className="text-[9px] font-extrabold uppercase tracking-[0.2em] mb-1.5"
                 style={{ fontFamily: "'Outfit', sans-serif", color: '#c4b5fd' }}>
              vertimas
            </div>
            <h3 className="text-sm font-bold leading-tight group-hover:opacity-80 transition"
                style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
              {t.title}
            </h3>
            {targetArtist && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
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
            <img src={f.avatar_url} alt=""
                 className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover transition"
                 style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--border-default)' }} />
          ) : (
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-base font-bold transition"
                 style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'rgba(255,255,255,0.4)' }}>
              {(f.full_name || f.username || '?')[0].toUpperCase()}
            </div>
          )}
          {f.is_vip_legacy && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2"
                  style={{ borderColor: 'var(--bg-body)' }} title="VIP" />
          )}
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-7 whitespace-nowrap text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none z-10"
                style={{ background: 'rgba(0,0,0,0.92)', color: '#fff' }}>
            {f.full_name || f.username}
          </span>
        </Link>
      ))}
    </div>
  )
}

function ProfileFooter({ profile, memberSinceYear, totalContent, isLegacy, isUnclaimed }: any) {
  return (
    <footer className="mt-16 sm:mt-20 pt-6"
            style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <p className="text-xs text-center mb-5"
         style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
        Music.lt narys nuo {memberSinceYear}
        {totalContent > 0 && <> · {totalContent.toLocaleString('lt-LT')} įrašų / dienos dainų</>}
        {profile.legacy_karma_points && <> · {profile.legacy_karma_points.toLocaleString('lt-LT')} reitingo taškų</>}
      </p>
      {isLegacy && isUnclaimed && (
        <div className="max-w-xl mx-auto text-center p-4 rounded-2xl"
             style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <p className="text-sm leading-relaxed mb-2.5"
             style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
            <span className="font-bold">Tai jūsų profilis?</span> Užsiregistruokite naujoje music.lt sistemoje tuo pačiu email'u — automatiškai sujungsime visą jūsų istoriją.
          </p>
          <Link href="/auth/signin"
                className="inline-block px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition uppercase tracking-wider"
                style={{ fontFamily: "'Outfit', sans-serif" }}>
            Atgauti accountą
          </Link>
        </div>
      )}
    </footer>
  )
}
