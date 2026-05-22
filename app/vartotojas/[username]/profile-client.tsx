'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// V7 — minimalus hero:
//   - Avatar + name + 1-line meta (Vilnius · nuo 2011 · VIP)
//   - PopBar'ai (Karma + Aktyvumas) vietoj numeric stats
//   - „ⓘ Daugiau" button → ProfileInfoModal
//   - Equalizer dešinėje (50% pločio) — hero variant, click filter
// Equalizer click rodo filter drawer'į žemiau.
//
// Body — viena „Naujausi įrašai" feed sekcija su featured (didžiausias)
// post'u + grid greta visu kitokių post types (blog, vertimai, topai).
// Sumažintos secondary sections.
//
// Daily picks dabar elegantiškos compact 4-col tile'ės.

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { SideEqualizer, FULL_TO_SHORT } from '@/components/profile/SideEqualizer'
import { FavoriteStylesChips } from '@/components/profile/FavoriteStylesChips'
import { DailyPicksCards } from '@/components/profile/DailyPicksCards'
import { ProfileInfoModal } from '@/components/profile/ProfileInfoModal'

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
    friends, blog,
    regularPosts, topasPosts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
  } = props

  const [infoOpen, setInfoOpen] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks
  const heroImage = profile.cover_image_url || profile.avatar_url

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

  const activityLevel = useMemo(() => {
    const t = totalContent
    if (t >= 1500) return 5
    if (t >= 500) return 4
    if (t >= 150) return 3
    if (t >= 40) return 2
    if (t >= 5) return 1
    return 0
  }, [totalContent])

  // Combined feed — visi blog post'ai (regular + topai) + vertimai (kaip
  // mažesni feed entry'iai)
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
  const sidePosts = combinedPosts.slice(1, 6)

  // Filtered artists pagal selectedGenre
  const filteredArtists = useMemo(() => {
    if (!selectedGenre) return favoriteArtists
    return favoriteArtists.filter((a: any) => {
      const genres: { id: number; name: string }[] = a.mainGenres || []
      return genres.some((g) => g.name === selectedGenre)
    })
  }, [favoriteArtists, selectedGenre])

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
    if (g) {
      setTimeout(() => filterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>

      {/* ═════════════════ HERO — minimalus 50/50 ═════════════════ */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 max-h-[560px] overflow-hidden">
          {heroImage ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${heroImage})`,
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

        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8 sm:pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">

            {/* LEFT — minimalus identity */}
            <div className="min-w-0">
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="relative flex-shrink-0">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
                      style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)' }}
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-4xl font-black"
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

                <div className="min-w-0 flex-1">
                  <h1
                    className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                    style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.75rem)', fontFamily: "'Outfit', sans-serif" }}
                  >
                    {profile.full_name || profile.username}
                  </h1>

                  {/* 1 line meta */}
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.78)' }}
                  >
                    <span className="font-semibold">@{profile.username}</span>
                    {profile.legacy_city && <><Dot /><span>{profile.legacy_city}</span></>}
                    <Dot />
                    <span>nuo {memberSinceYear}</span>
                    {isLegacy && isUnclaimed && (
                      <>
                        <Dot />
                        <span className="text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                              style={{ color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          archyvinis
                        </span>
                      </>
                    )}
                  </div>

                  {/* PopBar'ai — Karma + Aktyvumas */}
                  <div className="mt-4 flex flex-wrap items-center gap-5">
                    {karmaLevel > 0 && (
                      <PopBarSlot label="Karma" level={karmaLevel} icon="⭐" delayMs={450} />
                    )}
                    {activityLevel > 0 && (
                      <PopBarSlot label="Aktyvumas" level={activityLevel} icon="🔥" delayMs={2900} />
                    )}
                  </div>

                  {/* Info modal trigger */}
                  <button
                    onClick={() => setInfoOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition hover:opacity-80"
                    style={{
                      fontFamily: "'Outfit', sans-serif",
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                    }}
                  >
                    <span>ⓘ</span> Daugiau apie narį
                  </button>
                </div>
              </div>

              {/* Stiliai cloud */}
              {favoriteStyles && favoriteStyles.length > 0 && (
                <div className="mt-6">
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

            {/* RIGHT — Big equalizer (50%) */}
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

      {/* Filtered drawer */}
      {selectedGenre && (
        <section
          ref={filterRef}
          className="border-y"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
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
                <SubLabel>Atlikėjai</SubLabel>
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
                <SubLabel>Dienos dainos</SubLabel>
                <DailyPicksCards picks={filteredPicks.slice(0, 12)} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═════════════════ BODY ═════════════════ */}
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

        {/* Dienos dainos — compact cards */}
        {!selectedGenre && dailyPicks.length > 0 && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Dienos dainos"
              title="Kasdienis pasirinkimas"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} pasirinkimų`}
              link={stats.daily_picks > 12 ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksCards picks={dailyPicks.slice(0, 12)} />
          </section>
        )}

        {/* Mėgstamiausi albumai — iš likes (entity_type='album', entity_id IS NOT NULL) */}
        {!selectedGenre && (favoriteAlbums?.length > 0 || (likesCounts?.album?.pending || 0) > 0) && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Mėgstamiausi albumai"
              title="Klasikiniai diskai"
              meta={(() => {
                const resolved = likesCounts?.album?.resolved || favoriteAlbums.length
                const pending = likesCounts?.album?.pending || 0
                if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')} albumų — bus rodomi po atlikėjų importo`
                if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomi · ${pending.toLocaleString('lt-LT')} laukia importo`
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

        {/* Mėgstamiausios dainos */}
        {!selectedGenre && (favoriteTracks?.length > 0 || (likesCounts?.track?.pending || 0) > 0) && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Mėgstamiausios dainos"
              title="Privalomos klausytis"
              meta={(() => {
                const resolved = likesCounts?.track?.resolved || favoriteTracks.length
                const pending = likesCounts?.track?.pending || 0
                if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')} dainų — bus rodomos po atlikėjų importo`
                if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomos · ${pending.toLocaleString('lt-LT')} laukia importo`
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

        {/* Combined feed — featured + side grid */}
        {!selectedGenre && combinedPosts.length > 0 && blog && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Tinklaraštis"
              title="Naujausi įrašai"
              meta={`${combinedPosts.length}+ įrašų`}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi įrašai →' }}
            />
            <CombinedFeed featured={featuredPost} sidePosts={sidePosts} blogSlug={blog.slug} />
          </section>
        )}

        {/* Friends */}
        {!selectedGenre && friends && friends.length > 0 && (
          <section className="mt-10 sm:mt-12">
            <SectionHeader
              eyebrow="Bendrabūviai"
              title="Panašaus skonio nariai"
              meta={`${friends.length}${friends.length === 24 ? '+' : ''}`}
            />
            <FriendsAvatarGrid friends={friends} />
          </section>
        )}

        <ProfileFooter
          profile={profile}
          memberSinceYear={memberSinceYear}
          totalContent={totalContent}
          isLegacy={isLegacy}
          isUnclaimed={isUnclaimed}
        />
      </div>

      {infoOpen && (
        <ProfileInfoModal
          profile={profile}
          stats={stats}
          memberSinceYear={memberSinceYear}
          onClose={() => setInfoOpen(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PopBar — inline kopija iš artist-profile-client su own keyframe
// ─────────────────────────────────────────────────────────────────────────────

function PopBarSlot({ label, level, icon, delayMs = 450 }: { label: string; level: number; icon?: string; delayMs?: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && <span className="text-xs">{icon}</span>}
        <span className="text-[10px] font-extrabold uppercase tracking-wider"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.65)' }}>
          {label}
        </span>
      </div>
      <PopBar level={level} size="md" animate delayMs={delayMs} />
    </div>
  )
}

function PopBar({ level, size = 'sm', animate = false, delayMs = 450 }: { level: number; size?: 'sm' | 'md' | 'lg'; animate?: boolean; delayMs?: number }) {
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
              animation: `popBarFillProf 900ms cubic-bezier(0.22, 1, 0.36, 1) ${delayMs + 350 * i}ms forwards`,
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
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function Dot() {
  return <span style={{ color: 'rgba(255,255,255,0.35)' }}>·</span>
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-extrabold uppercase tracking-widest mb-3"
         style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
      {children}
    </div>
  )
}

function SectionHeader({ eyebrow, title, meta, link }: {
  eyebrow: string; title: string; meta?: string | null;
  link?: { href: string; label: string; onClick?: () => void }
}) {
  return (
    <div className="mb-4 sm:mb-5 flex items-end justify-between gap-3 flex-wrap">
      <div>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] mb-1.5"
             style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
          {eyebrow}
        </div>
        <h2 className="font-black tracking-[-0.025em] leading-[1.05]"
            style={{ fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.25rem, 2.5vw, 1.75rem)', color: 'var(--text-primary)' }}>
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

function EmptyMigrationState({ what }: { what: string }) {
  return (
    <div
      className="p-6 rounded-2xl text-center"
      style={{
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-default)',
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Šis sąrašas atsiras, kai bus migruoti palaikinimai (♥). Tada matysite užsidžiaugtus {what}, surūšiuotus pagal įsimylėjimo seką.
      </p>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Likes jau scrape'inami; sąrašas pasipildys po atlikėjų importo.
      </p>
    </div>
  )
}

function FavoriteAlbumsGrid({ albums }: { albums: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
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

function CompactMoodSong({ track, username }: { track: any; username: string }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url
  return (
    <section>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] mb-3"
           style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
        Nuotaikos daina
      </div>
      <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group block">
        <div className="relative flex items-center gap-4 sm:gap-6 p-4 sm:p-5 rounded-2xl overflow-hidden"
             style={{
               background: 'linear-gradient(to right, rgba(249,115,22,0.10), rgba(244,114,182,0.05), transparent)',
               border: '1px solid rgba(249,115,22,0.18)',
             }}>
          {coverImage && (
            <>
              <div aria-hidden className="absolute inset-0 -z-10 opacity-60"
                   style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(60px) saturate(1.6) brightness(0.5)', transform: 'scale(1.4)' }} />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/40 via-black/30 to-black/50" />
            </>
          )}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1.5 rounded-full opacity-40"
                 style={{ background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)', animation: 'moodSpinV7 12s linear infinite', filter: 'blur(4px)' }} />
            {coverImage ? (
              <img src={coverImage} alt="" className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 border-white/15"
                   style={{ animation: 'moodSpinV7 30s linear infinite' }} />
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
      <style>{`@keyframes moodSpinV7 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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

// ─────────────────────────────────────────────────────────────────────────────
// Combined feed — featured + side grid
// ─────────────────────────────────────────────────────────────────────────────

function CombinedFeed({ featured, sidePosts, blogSlug }: {
  featured: any | null; sidePosts: any[]; blogSlug: string
}) {
  if (!featured) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 lg:gap-6">
      <FeaturedPostCard post={featured} blogSlug={blogSlug} />
      {sidePosts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {sidePosts.map((p) => <SidePostCard key={`${p._kind}-${p.id}`} post={p} blogSlug={blogSlug} />)}
        </div>
      ) : (
        <div className="hidden lg:flex items-center justify-center text-xs"
             style={{ color: 'var(--text-muted)' }}>
          Daugiau įrašų neturi
        </div>
      )}
    </div>
  )
}

function postUrl(post: any, blogSlug: string): string {
  // translation post'ai turi savo blog slug saugotą _blogSlug; topai ir
  // įrašai naudoja user'io blogo slug.
  const slug = post._blogSlug || blogSlug
  return `/blogas/${slug}/${post.slug}`
}

function FeaturedPostCard({ post, blogSlug }: { post: any; blogSlug: string }) {
  const url = postUrl(post, blogSlug)
  const typeColor = POST_TYPE_COLOR[post.post_type] || '#f97316'
  const typeLabel = POST_TYPE_LABEL[post.post_type] || post.post_type
  const items = Array.isArray(post.list_items) ? post.list_items : null

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
        {post.cover_image_url ? (
          <img src={post.cover_image_url} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : items && items.length >= 4 ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full">
            {items.slice(0, 4).map((it: any, i: number) => (
              <div key={i} className="overflow-hidden" style={{ background: 'var(--bg-body)' }}>
                {it.image_url
                  ? <img src={it.image_url} alt="" className="w-full h-full object-cover" />
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

        {/* Top-left type badge */}
        <div className="absolute top-3 left-3 px-2 py-1 rounded-full backdrop-blur-md text-[10px] font-extrabold uppercase tracking-wider"
             style={{ background: `${typeColor}40`, color: typeColor, border: `1px solid ${typeColor}60` }}>
          {typeLabel}{items ? ` · ${items.length}` : ''}
        </div>

        {/* Bottom title overlay */}
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
  return (
    <Link href={url}
          className="group flex gap-3 p-3 rounded-xl transition hover:-translate-y-0.5"
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-subtle)',
          }}>
      {post.cover_image_url ? (
        <img src={post.cover_image_url} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0" />
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
