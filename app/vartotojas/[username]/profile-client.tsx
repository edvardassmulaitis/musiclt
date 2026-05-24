'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// V8 — kompaktiškas hero:
//   LEFT (identity):
//     • Mažesnis avataras (80px) — kokybės taupymas
//     • Vardas + popbar'ai (Karma + Aktyvumas) à la artist page
//     • Subtilus „Apie narį" SVG mygtukas → ProfileInfoModal
//     • @username, miestas, year, archyvinis chip — IŠKELTI į modal'ą
//   RIGHT (skonio + nuotaikos):
//     • Mood song row (kompaktiškas) — click atidaro MoodSongModal'ą
//     • Kompaktiškas SideEqualizer — click atidaro GenreFilterModal'ą
//     • Mėgstamiausi substyles chips — po equalizeriu, kad viskas
//       butų vientisas vertikalus blokas
//
// Body — sekcijų eiliškumas po V8 perdarymo:
//   1. Naujausi įrašai (perkeltas aukščiau)
//   2. Mėgstami atlikėjai (kompakt — 6 desktop)
//   3. Dienos dainos (compact + +N tile vietoj title link)
//   4. Mėgstamiausi albumai
//   5. Mėgstamiausios dainos
//
// Drop'inom: Bendrabūviai section + footer „X įrašų, Y karma" eilutė.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { SideEqualizer } from '@/components/profile/SideEqualizer'
import { FavoriteStylesChips } from '@/components/profile/FavoriteStylesChips'
import { DailyPicksCards } from '@/components/profile/DailyPicksCards'
import { ProfileInfoModal } from '@/components/profile/ProfileInfoModal'
import { GenreFilterModal } from '@/components/profile/GenreFilterModal'
import { MoodSongModal } from '@/components/profile/MoodSongModal'

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
    profile, favoriteArtists, favoriteStyles, favoriteAlbums, favoriteTracks, likesCounts,
    blog,
    regularPosts, topasPosts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
  } = props

  const [infoOpen, setInfoOpen] = useState(false)
  const [genreModal, setGenreModal] = useState<string | null>(null)
  const [moodOpen, setMoodOpen] = useState(false)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks

  // PopBar levels — derived from legacy stats
  const karmaLevel = useMemo(() => {
    const k = profile.legacy_karma_points || 0
    if (k >= 20000) return 5
    if (k >= 5000) return 4
    if (k >= 1500) return 3
    if (k >= 300) return 2
    if (k >= 50) return 1
    return 0
  }, [profile.legacy_karma_points])

  // Recent activity heuristic — kol kas paprasta: total content. Vėliau
  // galima įvesti "paskutinių 90d įrašų" skaičiavimą per DB query.
  const activityLevel = useMemo(() => {
    const t = totalContent
    if (t >= 1500) return 5
    if (t >= 500) return 4
    if (t >= 150) return 3
    if (t >= 40) return 2
    if (t >= 5) return 1
    return 0
  }, [totalContent])

  // Combined feed — visi blog post'ai (regular + topai) + vertimai
  const combinedPosts = useMemo(() => {
    const allPosts: any[] = []
    for (const p of regularPosts) allPosts.push({ ...p, _kind: 'post' })
    for (const p of topasPosts) allPosts.push({ ...p, _kind: 'topas' })
    for (const t of translations) {
      const tslug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
      const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
      const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
      allPosts.push({
        id: t.id,
        slug: t.slug,
        title: t.title,
        summary: targetArtist
          ? `${targetArtist.name}${targetTrack ? ' — ' + targetTrack.title : ''}`
          : null,
        cover_image_url: null,
        published_at: t.published_at || t.created_at,
        post_type: 'translation',
        _kind: 'translation',
        _blogSlug: tslug,
      })
    }
    return allPosts.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
  }, [regularPosts, topasPosts, translations])

  const featuredPost = combinedPosts[0] || null
  const sidePosts = combinedPosts.slice(1, 5)

  // Filtruoti atlikėjai per genre modal'ą
  const filteredArtists = useMemo(() => {
    if (!genreModal) return []
    return favoriteArtists.filter((a: any) => {
      const genres: { id: number; name: string }[] = a.mainGenres || []
      return genres.some((g) => g.name === genreModal)
    })
  }, [favoriteArtists, genreModal])

  const filteredPicks = useMemo(() => {
    if (!genreModal) return []
    return dailyPicks.filter((p: any) => {
      if (!p.tracks) return false
      const genres: { id: number; name: string }[] = p.tracks.artistMainGenres || []
      return genres.some((g) => g.name === genreModal)
    })
  }, [dailyPicks, genreModal])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>

      {/* ═════════════════ HERO ═════════════════ */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 max-h-[520px] overflow-hidden">
          {profile.cover_image_url || profile.avatar_url ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${profile.cover_image_url || profile.avatar_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(90px) saturate(1.5) brightness(0.32)',
                  transform: 'scale(1.4)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-[var(--bg-body)]" />
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1a2436 0%, #0f1622 50%, var(--bg-body) 100%)' }} />
          )}
        </div>

        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-7 sm:pb-9">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,1.05fr)] gap-6 lg:gap-9 items-start">

            {/* LEFT — minimalus identity */}
            <div className="min-w-0">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      width={80}
                      height={80}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
                      style={{
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        borderColor: 'rgba(255,255,255,0.12)',
                        imageRendering: 'auto',
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-3xl font-black"
                         style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)' }}>
                      {(profile.full_name || profile.username || '?')[0].toUpperCase()}
                    </div>
                  )}
                  {profile.is_vip_legacy && (
                    <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-600 text-black text-[9px] font-extrabold uppercase tracking-wider shadow">
                      VIP
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <h1
                    className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                    style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.6rem)', fontFamily: "'Outfit', sans-serif" }}
                  >
                    {profile.username}
                  </h1>

                  {/* PopBar'ai — Karma + Aktyvumas (artist page style) */}
                  {(karmaLevel > 0 || activityLevel > 0) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {karmaLevel > 0 && (
                        <PopBarChip
                          level={karmaLevel}
                          title="Karma — istoriniai music.lt taškai"
                          delayMs={350}
                          icon={
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                              <path d="M12 2l2.39 7.36H22l-6.18 4.48L18.21 22 12 17.27 5.79 22l2.39-8.16L2 9.36h7.61z" />
                            </svg>
                          }
                        />
                      )}
                      {activityLevel > 0 && (
                        <PopBarChip
                          level={activityLevel}
                          title="Aktyvumas — turinio kūrimo intensyvumas"
                          delayMs={1730}
                          revealDelayMs={1450}
                          icon={
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                              <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
                            </svg>
                          }
                        />
                      )}
                    </div>
                  )}

                  {/* Info modal trigger — subtle SVG ikona */}
                  <button
                    onClick={() => setInfoOpen(true)}
                    className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition hover:opacity-80"
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      color: 'rgba(255,255,255,0.78)',
                    }}
                    aria-label="Apie narį"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Apie narį
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT — Mood + Equalizer + Substyles (vienas vertikalus blokas) */}
            <div className="min-w-0 flex flex-col gap-3.5 lg:gap-4">
              {moodTrack && (
                <CompactMoodSongRow track={moodTrack} onClick={() => setMoodOpen(true)} />
              )}
              <SideEqualizer
                meter={profile.legacy_music_meter}
                selectedGenre={null}
                onSelect={(g) => g && setGenreModal(g)}
                variant="compact"
              />
              {favoriteStyles && favoriteStyles.length > 0 && (
                <div
                  className="rounded-2xl p-3.5 sm:p-4"
                  style={{
                    background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    className="text-[10px] font-extrabold uppercase tracking-[0.18em] mb-2.5"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
                  >
                    Mėgstamiausi stiliai
                  </div>
                  <FavoriteStylesChips styles={favoriteStyles} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════ BODY ═════════════════ */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-20">

        {/* 1. NAUJAUSI ĮRAŠAI — perkelta į viršų */}
        {combinedPosts.length > 0 && blog && (
          <section>
            <SectionHeader
              title="Naujausi įrašai"
              meta={`${combinedPosts.length}+ įrašų`}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi įrašai →' }}
            />
            <CombinedFeed featured={featuredPost} sidePosts={sidePosts} blogSlug={blog.slug} />
          </section>
        )}

        {/* 2. ATLIKĖJAI — kompaktiškas */}
        {favoriteArtists.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader title="Mėgstami atlikėjai" meta={null} />
            <FavoriteArtistsCompact artists={favoriteArtists} maxShown={8} />
          </section>
        )}

        {/* 3. DIENOS DAINOS — compact */}
        {dailyPicks.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Kasdienis pasirinkimas"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
            />
            <DailyPicksWithMore
              picks={dailyPicks}
              maxShown={8}
              hasMoreHref={stats.daily_picks > 8 ? `/vartotojas/${profile.username}/dienos-dainos` : null}
              totalCount={stats.daily_picks}
            />
          </section>
        )}

        {/* 4. ALBUMAI */}
        {(favoriteAlbums?.length > 0 || (likesCounts?.album?.pending || 0) > 0) && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstamiausi albumai"
              meta={(() => {
                const resolved = likesCounts?.album?.resolved || favoriteAlbums.length
                const pending = likesCounts?.album?.pending || 0
                if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')} albumų`
                if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomi · ${pending.toLocaleString('lt-LT')} laukia`
                return `${resolved.toLocaleString('lt-LT')} albumų`
              })()}
            />
            {favoriteAlbums.length > 0 ? (
              <FavoriteAlbumsGrid albums={favoriteAlbums} />
            ) : (
              <EmptyMigrationState what="albumus" />
            )}
          </section>
        )}

        {/* 5. DAINOS */}
        {(favoriteTracks?.length > 0 || (likesCounts?.track?.pending || 0) > 0) && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Privalomos klausytis"
              meta={(() => {
                const resolved = likesCounts?.track?.resolved || favoriteTracks.length
                const pending = likesCounts?.track?.pending || 0
                if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')} dainų`
                if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomos · ${pending.toLocaleString('lt-LT')} laukia`
                return `${resolved.toLocaleString('lt-LT')} dainų`
              })()}
            />
            {favoriteTracks.length > 0 ? (
              <FavoriteTracksList tracks={favoriteTracks} />
            ) : (
              <EmptyMigrationState what="dainas" />
            )}
          </section>
        )}

        <SimpleClaimFooter profile={profile} isLegacy={isLegacy} isUnclaimed={isUnclaimed} memberSinceYear={memberSinceYear} />
      </div>

      {infoOpen && (
        <ProfileInfoModal
          profile={profile}
          stats={stats}
          memberSinceYear={memberSinceYear}
          onClose={() => setInfoOpen(false)}
        />
      )}

      {genreModal && (
        <GenreFilterModal
          genre={genreModal}
          artists={filteredArtists}
          picks={filteredPicks}
          onClose={() => setGenreModal(null)}
        />
      )}

      {moodOpen && moodTrack && (
        <MoodSongModal
          track={moodTrack}
          username={profile.full_name || profile.username}
          onClose={() => setMoodOpen(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PopBar chip — replikuoja artist page'o estetiką
// ─────────────────────────────────────────────────────────────────────────────

function PopBarChip({
  level, title, icon, delayMs = 450, revealDelayMs = 0,
}: {
  level: number
  title: string
  icon: React.ReactNode
  delayMs?: number
  revealDelayMs?: number
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1 transition-all hover:scale-[1.03] hover:border-[var(--accent-orange)] lg:border-white/15 lg:bg-white/10 lg:backdrop-blur-md lg:hover:border-white/40 lg:hover:bg-white/20"
      style={
        revealDelayMs > 0
          ? {
              opacity: 0,
              transform: 'translateY(4px) scale(0.92)',
              animation: `popChipReveal 380ms cubic-bezier(0.22, 1, 0.36, 1) ${revealDelayMs}ms forwards`,
            }
          : undefined
      }
    >
      {icon}
      <PopBar level={level} animate delayMs={delayMs} />
      <style>{`
        @keyframes popChipReveal {
          0%   { opacity: 0; transform: translateY(4px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </button>
  )
}

function PopBar({ level, size = 'md', animate = false, delayMs = 450 }: { level: number; size?: 'sm' | 'md' | 'lg'; animate?: boolean; delayMs?: number }) {
  const total = 5
  const dashCls =
    size === 'lg' ? 'h-[6px] w-[32px] rounded-[3px] sm:w-[40px]' :
    size === 'md' ? 'h-[4px] w-[22px] rounded-[2px] sm:w-[26px]' :
    'h-[3px] w-[14px] rounded-[2px]'
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < level
        const animStyle: React.CSSProperties = animate && filled
          ? {
              opacity: 0,
              transform: 'translateX(-10px) scale(0.3)',
              transformOrigin: 'left center',
              animation: `popBarFillProf 900ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs + 320 * i}ms forwards`,
              ['--popbar-flash' as any]: 'var(--accent-orange)',
            }
          : { opacity: filled ? 0.55 + (0.45 * (i + 1) / total) : 1 }
        return (
          <span
            key={i}
            className={[
              dashCls,
              'transition-colors',
              filled ? 'bg-[var(--accent-orange)]' : 'bg-[rgba(255,255,255,0.18)]',
            ].join(' ')}
            style={animStyle}
          />
        )
      })}
      <style>{`
        @keyframes popBarFillProf {
          0%   { opacity: 0; transform: translateX(-10px) scale(0.3); box-shadow: 0 0 0 0 transparent; }
          55%  { opacity: 1; transform: translateX(0) scale(1.25); box-shadow: 0 0 18px 3px var(--popbar-flash, var(--accent-orange)); }
          100% { opacity: 1; transform: translateX(0) scale(1); box-shadow: 0 0 0 0 transparent; }
        }
      `}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mood Song — kompaktiškas row, kuris atidaro modal'ą
// ─────────────────────────────────────────────────────────────────────────────

function CompactMoodSongRow({ track, onClick }: { track: any; onClick: () => void }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url || track.cover_url

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 sm:gap-4 rounded-2xl p-3 sm:p-3.5 overflow-hidden text-left transition-all hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(to right, rgba(249,115,22,0.10), rgba(244,114,182,0.05), transparent)',
        border: '1px solid rgba(249,115,22,0.18)',
      }}
      title="Atidaryti nuotaikos dainą"
    >
      {coverImage && (
        <>
          <div aria-hidden className="absolute inset-0 -z-10 opacity-50"
               style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.6) brightness(0.5)', transform: 'scale(1.4)' }} />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/30 to-black/50" />
        </>
      )}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-1 rounded-full opacity-40"
             style={{ background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)', animation: 'moodSpinV8 12s linear infinite', filter: 'blur(3px)' }} />
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="" className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover border-2 border-white/15"
               style={{ animation: 'moodSpinV8 30s linear infinite' }} />
        ) : (
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-xl">♬</div>
        )}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full border border-white/20"
             style={{ background: 'var(--bg-body)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-orange-300 mb-0.5"
          style={{ fontFamily: "'Outfit', sans-serif" }}
        >
          Nuotaikos daina
        </p>
        <h3
          className="font-extrabold text-white leading-tight tracking-[-0.02em] truncate"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1rem, 2vw, 1.25rem)' }}
        >
          {track.title}
        </h3>
        <p
          className="text-xs mt-0.5 font-semibold truncate"
          style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.78)' }}
        >
          {artist?.name || 'Nežinomas atlikėjas'}
        </p>
      </div>
      <span
        aria-hidden
        className="relative ml-1 flex h-7 w-7 items-center justify-center rounded-full text-xs opacity-60 transition group-hover:opacity-100"
        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
      >
        ▸
      </span>
      <style>{`@keyframes moodSpinV8 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, meta, link }: {
  title: string; meta?: string | null;
  link?: { href: string; label: string; onClick?: () => void }
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 className="font-black tracking-[-0.025em] leading-[1.05]"
            style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.15rem, 2.2vw, 1.5rem)', color: 'var(--text-primary)' }}>
          {title}
        </h2>
        {meta && (
          <p className="text-[11px] sm:text-xs mt-1" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
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

function EmptyMigrationState({ what }: { what: string }) {
  return (
    <div
      className="p-4 rounded-2xl text-center"
      style={{
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-default)',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Šis sąrašas atsiras, kai bus migruoti palaikinimai (♥). Tada matysite užsidžiaugtus {what}.
      </p>
    </div>
  )
}

function FavoriteArtistsCompact({ artists, maxShown = 8 }: { artists: any[]; maxShown?: number }) {
  const shown = artists.slice(0, maxShown)
  return (
    <>
      {/* Mobile — horizontal scroll */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 sm:hidden flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((a: any) => (
          <ArtistTile key={a.id} a={a} className="flex-shrink-0 w-[140px] aspect-square" />
        ))}
      </div>
      {/* Desktop — grid */}
      <div className="hidden sm:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {shown.map((a: any) => (
          <ArtistTile key={a.id} a={a} className="aspect-square" />
        ))}
      </div>
    </>
  )
}

function ArtistTile({ a, className = '' }: { a: any; className?: string }) {
  return (
    <Link
      href={`/atlikejai/${a.slug}`}
      className={`group relative rounded-xl overflow-hidden ${className}`}
      style={{ background: 'var(--card-surface, var(--bg-elevated))' }}
    >
      {a.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.cover_image_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-2xl font-black"
             style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.12)' }}>
          {a.name[0].toUpperCase()}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-2.5">
        <p className="text-xs sm:text-sm font-extrabold text-white leading-tight truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {a.name}
        </p>
      </div>
    </Link>
  )
}

function DailyPicksWithMore({
  picks, maxShown, hasMoreHref, totalCount,
}: {
  picks: any[]
  maxShown: number
  hasMoreHref: string | null
  totalCount: number
}) {
  // Mobile = horizontal scroll, desktop = grid 1-2 eilutės (cap 8) + +N tile
  const shown = picks.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)

  return (
    <>
      {/* Mobile */}
      <div className="-mx-4 px-4 sm:hidden flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {shown.map((p) => (
          <div key={p.id} className="flex-shrink-0 w-[150px]">
            <DailyPicksCards picks={[p]} />
          </div>
        ))}
        {hasMoreHref && remaining > 0 && (
          <Link
            href={hasMoreHref}
            className="flex-shrink-0 w-[150px] aspect-square rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03]"
            style={{
              background: 'var(--card-bg)',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              +{remaining.toLocaleString('lt-LT')}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Visa istorija
            </span>
          </Link>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {shown.map((p) => (
          <DailyPicksCards key={p.id} picks={[p]} />
        ))}
        {hasMoreHref && remaining > 0 && (
          <Link
            href={hasMoreHref}
            className="aspect-square rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03]"
            style={{
              background: 'var(--card-bg)',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="text-3xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              +{remaining.toLocaleString('lt-LT')}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Visa istorija
            </span>
          </Link>
        )}
      </div>
    </>
  )
}

function FavoriteAlbumsGrid({ albums }: { albums: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
      {albums.map((a) => {
        const artist = Array.isArray(a.artists) ? a.artists[0] : a.artists
        const href = artist ? `/atlikejai/${artist.slug}/${a.slug || a.id}` : `/lt/albumas/${a.slug || ''}/${a.id}`
        return (
          <Link key={a.id} href={href}
                className="group block rounded-xl overflow-hidden transition hover:scale-[1.03]"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
            <div className="aspect-square w-full overflow-hidden"
                 style={{ background: 'linear-gradient(135deg, var(--border-subtle), var(--card-bg))' }}>
              {a.cover_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={a.cover_url} alt={a.title} className="w-full h-full object-cover transition group-hover:opacity-90" loading="lazy" />
              ) : null}
            </div>
            <div className="p-2.5">
              <div className="text-[11px] uppercase tracking-wider mb-0.5 truncate"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                {artist?.name || '—'}
              </div>
              <div className="text-sm font-semibold leading-tight line-clamp-2"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {a.title}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function FavoriteTracksList({ tracks }: { tracks: any[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {tracks.map((t, i) => {
        const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
        const href = artist ? `/atlikejai/${artist.slug}/${t.slug || t.id}` : `/lt/daina/${t.slug || ''}/${t.id}`
        return (
          <Link key={t.id} href={href}
                className="group flex items-center gap-3 rounded-xl p-2 transition hover:bg-[var(--hover-bg)]"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
            <div className="w-6 text-center text-[11px] font-bold tabular-nums"
                 style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
              {i + 1}
            </div>
            <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0"
                 style={{ background: 'var(--border-subtle)' }}>
              {t.cover_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.cover_url} alt={t.title} className="w-full h-full object-cover" loading="lazy" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight truncate"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {t.title}
              </div>
              <div className="text-[11px] truncate"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                {artist?.name || '—'}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined feed — featured + side grid (su YT thumb fallback'u)
// ─────────────────────────────────────────────────────────────────────────────

function CombinedFeed({ featured, sidePosts, blogSlug }: {
  featured: any | null; sidePosts: any[]; blogSlug: string
}) {
  if (!featured) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 lg:gap-5">
      <FeaturedPostCard post={featured} blogSlug={blogSlug} />
      {sidePosts.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {sidePosts.map((p) => <SidePostCard key={`${p._kind}-${p.id}`} post={p} blogSlug={blogSlug} />)}
        </div>
      ) : null}
    </div>
  )
}

function postUrl(post: any, blogSlug: string): string {
  const slug = post._blogSlug || blogSlug
  return `/blogas/${slug}/${post.slug}`
}

function FeaturedPostCard({ post, blogSlug }: { post: any; blogSlug: string }) {
  const url = postUrl(post, blogSlug)
  const typeColor = POST_TYPE_COLOR[post.post_type] || '#f97316'
  const typeLabel = POST_TYPE_LABEL[post.post_type] || post.post_type
  const items = Array.isArray(post.list_items) ? post.list_items : null
  const heroImg = post.cover_image_url || post.fallback_thumb_url

  return (
    <Link href={url}
          className="group block rounded-2xl overflow-hidden transition hover:-translate-y-0.5"
          style={{
            background: 'var(--card-surface, var(--bg-elevated))',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          }}>
      <div className="relative aspect-[16/9] overflow-hidden"
           style={{ background: 'var(--bg-elevated)' }}>
        {heroImg ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={heroImg} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : items && items.length >= 4 ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full">
            {items.slice(0, 4).map((it: any, i: number) => (
              <div key={i} className="overflow-hidden" style={{ background: 'var(--bg-body)' }}>
                {it.image_url
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-lg" style={{ color: 'var(--text-faint)' }}>{i + 1}</div>}
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-500/15 to-rose-600/15 flex items-center justify-center text-6xl"
               style={{ color: 'var(--text-faint)' }}>
            {typeLabel?.[0] || '?'}
          </div>
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

        <div className="absolute top-3 left-3 px-2 py-1 rounded-full backdrop-blur-md text-[10px] font-extrabold uppercase tracking-wider"
             style={{ background: `${typeColor}40`, color: typeColor, border: `1px solid ${typeColor}60` }}>
          {typeLabel}{items ? ` · ${items.length}` : ''}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
          <h3 className="text-lg sm:text-xl lg:text-2xl font-black leading-tight text-white drop-shadow group-hover:text-orange-200 transition line-clamp-2"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
            {post.title}
          </h3>
          <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-wider font-bold text-white/70">
            <span>{new Date(post.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            {post.like_count > 0 && <span>♥ {post.like_count}</span>}
            {post.comment_count > 0 && <span>💬 {post.comment_count}</span>}
          </div>
        </div>
      </div>

      {post.summary && (
        <div className="p-4 sm:p-5">
          <p className="text-sm line-clamp-2"
             style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
            {post.summary}
          </p>
        </div>
      )}
    </Link>
  )
}

function SidePostCard({ post, blogSlug }: { post: any; blogSlug: string }) {
  const url = postUrl(post, blogSlug)
  const typeColor = POST_TYPE_COLOR[post.post_type] || '#5e7290'
  const typeLabel = POST_TYPE_LABEL[post.post_type] || post.post_type
  const thumb = post.cover_image_url || post.fallback_thumb_url

  return (
    <Link href={url}
          className="group flex gap-3 p-3 rounded-xl transition hover:-translate-y-0.5"
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
          }}>
      {thumb ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={thumb} alt="" loading="lazy" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex-shrink-0 flex items-center justify-center text-xl"
             style={{ background: `linear-gradient(135deg, ${typeColor}25, ${typeColor}10)`, color: typeColor }}>
          {typeLabel?.[0] || '?'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-extrabold uppercase tracking-wider mb-1"
             style={{ fontFamily: "'Outfit', sans-serif", color: typeColor }}>
          {typeLabel}
        </div>
        <h4 className="text-sm font-bold leading-tight line-clamp-2 group-hover:opacity-80 transition"
            style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
          {post.title}
        </h4>
        {post.summary && (
          <p className="text-[11px] mt-1 line-clamp-1"
             style={{ color: 'var(--text-muted)' }}>
            {post.summary}
          </p>
        )}
        <p className="text-[10px] mt-1 uppercase tracking-wider font-bold flex gap-2"
           style={{ color: 'var(--text-faint)' }}>
          <span>{new Date(post.published_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
          {post.like_count > 0 && <span>♥ {post.like_count}</span>}
        </p>
      </div>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer — tik claim CTA legacy archyviniams; numetam summary eilutę
// ─────────────────────────────────────────────────────────────────────────────

function SimpleClaimFooter({ isLegacy, isUnclaimed }: any) {
  if (!isLegacy || !isUnclaimed) return null
  return (
    <footer className="mt-12 sm:mt-16 pt-6"
            style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="max-w-xl mx-auto text-center p-4 rounded-2xl"
           style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
        <p className="text-sm leading-relaxed mb-2.5"
           style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
          <span className="font-bold">Tai jūsų profilis?</span> Užsiregistruokite naujoje music.lt sistemoje tuo pačiu email&apos;u — automatiškai sujungsime visą jūsų istoriją.
        </p>
        <Link href="/auth/signin"
              className="inline-block px-4 py-2 rounded-full bg-amber-500 text-black text-xs font-extrabold hover:bg-amber-400 transition uppercase tracking-wider"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
          Atgauti accountą
        </Link>
      </div>
    </footer>
  )
}
