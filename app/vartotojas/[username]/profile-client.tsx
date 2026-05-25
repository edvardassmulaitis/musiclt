'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// V10 — refined creator-profile:
//
//   HERO — minimaliai identity
//     • Avatar + vardas + popbar'ai + bio tagline (jei trumpas)
//     • „Apie narį" subtle button
//     • Jokio stat strip'o — stats į ProfileInfoModal
//
//   NOW PLAYING — full-width pill, jei profile.mood_song_track_id resolved
//
//   MUSIC IDENTITY — equalizer + substyles bendrai
//     • Equalizer top: 8 main genre bars (compact hero variant)
//     • Substyles chips po apačia (dideli/mažesni pagal sort_order)
//     • Click ant bar → GenreFilterModal (main genre filter)
//     • Click ant substyle chip → GenreFilterModal (substyle filter)
//
//   NAUJAUSI ĮRAŠAI — featured + 4 side, richer hero fallback chain
//
//   DIENOS DAINOS PASIRINKIMAI — kompaktiškos kortelės su pavadinimu +
//     komentaru (h-scroll)
//
//   MĖGSTAMI ATLIKĖJAI / ALBUMAI / DAINOS
//     • Compact grid + paskutinis tile'as „+N daugiau" → MoreItemsModal
//
//   DISKUSIJOS — paskutiniai user'io komentarai per visas entity'es

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { SideEqualizer } from '@/components/profile/SideEqualizer'
import { DailyPicksCards } from '@/components/profile/DailyPicksCards'
import { ProfileInfoModal } from '@/components/profile/ProfileInfoModal'
import { GenreFilterModal } from '@/components/profile/GenreFilterModal'
import { MoodSongModal } from '@/components/profile/MoodSongModal'
import { MoreItemsModal } from '@/components/profile/MoreItemsModal'

const POST_TYPE_LABEL: Record<string, string> = {
  article: 'Straipsnis', review: 'Recenzija', event: 'Renginys', creation: 'Kūryba',
  translation: 'Vertimas', topas: 'Topas',
}
const POST_TYPE_COLOR: Record<string, string> = {
  article: '#f97316', review: '#fbbf24', event: '#34d399', creation: '#f472b6',
  translation: '#a78bfa', topas: '#60a5fa',
}

type SubstyleFilter = { kind: 'substyle'; legacyId: number; name: string }
type GenreFilter = { kind: 'genre'; name: string }
type AnyFilter = SubstyleFilter | GenreFilter

export function ProfileClient(props: any) {
  const {
    profile, favoriteArtists, favoriteStyles, favoriteAlbums, favoriteTracks, likesCounts,
    blog,
    regularPosts, topasPosts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
    recentComments,
  } = props

  const [infoOpen, setInfoOpen] = useState(false)
  const [musicFilter, setMusicFilter] = useState<AnyFilter | null>(null)
  const [moodOpen, setMoodOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState<'artist' | 'album' | 'track' | null>(null)

  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const totalContent = stats.diary + stats.translate + stats.creation + stats.daily_picks

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

  // Filtruoti per genre arba substyle
  const filteredArtists = useMemo(() => {
    if (!musicFilter) return []
    if (musicFilter.kind === 'genre') {
      return favoriteArtists.filter((a: any) =>
        (a.mainGenres || []).some((g: any) => g.name === musicFilter.name),
      )
    }
    return favoriteArtists.filter((a: any) =>
      (a.substyleIds || []).includes(musicFilter.legacyId),
    )
  }, [favoriteArtists, musicFilter])

  const filteredPicks = useMemo(() => {
    if (!musicFilter) return []
    return dailyPicks.filter((p: any) => {
      if (!p.tracks) return false
      const genres: { id: number; name: string }[] = p.tracks.artistMainGenres || []
      if (musicFilter.kind === 'genre') {
        return genres.some((g) => g.name === musicFilter.name)
      }
      return false // substyles per pick'ą nepasiekiamas dabar
    })
  }, [dailyPicks, musicFilter])

  const bioTagline = useMemo(() => {
    if (!profile.bio) return null
    const firstLine = profile.bio.split('\n')[0].trim()
    if (firstLine.length > 0 && firstLine.length <= 120) return firstLine
    return null
  }, [profile.bio])

  const hasMusicMeter = profile.legacy_music_meter
    && Array.isArray(profile.legacy_music_meter)
    && profile.legacy_music_meter.length > 0

  const albumResolvedTotal = likesCounts?.album?.resolved || favoriteAlbums.length
  const trackResolvedTotal = likesCounts?.track?.resolved || favoriteTracks.length

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-body)', color: 'var(--text-primary)' }}>

      {/* ═════════════════ HERO ═════════════════ */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 max-h-[440px] overflow-hidden">
          {profile.cover_image_url || profile.avatar_url ? (
            <>
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${profile.cover_image_url || profile.avatar_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(120px) saturate(1.35) brightness(0.3)',
                  transform: 'scale(1.4)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-[var(--bg-body)]" />
            </>
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #1a2436 0%, #0f1622 50%, var(--bg-body) 100%)' }} />
          )}
        </div>

        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pt-9 sm:pt-12 pb-6 sm:pb-7">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-6 text-center sm:text-left">

            <div className="relative flex-shrink-0">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt=""
                  width={88}
                  height={88}
                  className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-2xl object-cover shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
                  style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)' }}
                />
              ) : (
                <div className="w-20 h-20 sm:w-[88px] sm:h-[88px] rounded-2xl bg-gradient-to-br from-[#1a2436] to-[#0f1622] flex items-center justify-center text-3xl font-black"
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
                style={{ fontSize: 'clamp(1.85rem, 4vw, 2.85rem)', fontFamily: "'Outfit', sans-serif" }}
              >
                {profile.username}
              </h1>

              {bioTagline && (
                <p
                  className="mt-2 text-sm sm:text-[15px] leading-relaxed"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    color: 'rgba(255,255,255,0.78)',
                    maxWidth: '62ch',
                  }}
                >
                  {bioTagline}
                </p>
              )}

              {/* PopBar'ai */}
              {(karmaLevel > 0 || activityLevel > 0) && (
                <div className="mt-3.5 flex flex-wrap items-center justify-center sm:justify-start gap-2">
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
      </section>

      {/* ═════════════════ BODY ═════════════════ */}
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-20">

        {/* NOW PLAYING — full-width thin strip */}
        {moodTrack && (
          <div className="mt-2 sm:mt-3">
            <NowPlayingStrip track={moodTrack} onClick={() => setMoodOpen(true)} />
          </div>
        )}

        {/* MUSIC IDENTITY — equalizer + substyles bendrai */}
        {(hasMusicMeter || (favoriteStyles && favoriteStyles.length > 0)) && (
          <section className="mt-5 sm:mt-6">
            <MusicIdentityBlock
              meter={profile.legacy_music_meter}
              styles={favoriteStyles || []}
              onSelectGenre={(g) => setMusicFilter(g ? { kind: 'genre', name: g } : null)}
              onSelectSubstyle={(s) => setMusicFilter({ kind: 'substyle', legacyId: s.legacyId, name: s.name })}
            />
          </section>
        )}

        {/* NAUJAUSI ĮRAŠAI */}
        {combinedPosts.length > 0 && blog && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Naujausi įrašai"
              meta={`${combinedPosts.length}+ įrašų`}
              link={{ href: `/blogas/${blog.slug}`, label: 'Visi įrašai →' }}
            />
            <CombinedFeed featured={featuredPost} sidePosts={sidePosts} blogSlug={blog.slug} />
          </section>
        )}

        {/* DIENOS DAINOS PASIRINKIMAI */}
        {dailyPicks.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Dienos dainos pasirinkimai"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} dienų ši kolekcija auga`}
              link={stats.daily_picks > 12 ? { href: `/vartotojas/${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksScrollRow
              picks={dailyPicks}
              maxShown={12}
              totalCount={stats.daily_picks}
              moreHref={stats.daily_picks > 12 ? `/vartotojas/${profile.username}/dienos-dainos` : null}
            />
          </section>
        )}

        {/* MĖGSTAMI ATLIKĖJAI */}
        {favoriteArtists.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstami atlikėjai"
              meta={`${favoriteArtists.length} atlikėjų`}
            />
            <ArtistsGridWithMore
              artists={favoriteArtists}
              maxShown={11}
              onOpenMore={() => setMoreOpen('artist')}
              totalCount={favoriteArtists.length}
            />
          </section>
        )}

        {/* MĖGSTAMIAUSI ALBUMAI */}
        {(favoriteAlbums.length > 0 || (likesCounts?.album?.pending || 0) > 0) && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstamiausi albumai"
              meta={albumMeta(albumResolvedTotal, likesCounts?.album?.pending || 0)}
            />
            {favoriteAlbums.length > 0 ? (
              <AlbumsGridWithMore
                albums={favoriteAlbums}
                maxShown={11}
                onOpenMore={() => setMoreOpen('album')}
                totalCount={albumResolvedTotal}
              />
            ) : (
              <EmptyMigrationState what="albumus" />
            )}
          </section>
        )}

        {/* MĖGSTAMIAUSIOS DAINOS */}
        {(favoriteTracks.length > 0 || (likesCounts?.track?.pending || 0) > 0) && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstamiausios dainos"
              meta={trackMeta(trackResolvedTotal, likesCounts?.track?.pending || 0)}
            />
            {favoriteTracks.length > 0 ? (
              <TracksGridWithMore
                tracks={favoriteTracks}
                maxShown={11}
                onOpenMore={() => setMoreOpen('track')}
                totalCount={trackResolvedTotal}
              />
            ) : (
              <EmptyMigrationState what="dainas" />
            )}
          </section>
        )}

        {/* DISKUSIJOS — activity log */}
        {recentComments && recentComments.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Diskusijos"
              meta="Paskutiniai nario komentarai"
            />
            <RecentCommentsList comments={recentComments} />
          </section>
        )}

        <SimpleClaimFooter isLegacy={isLegacy} isUnclaimed={isUnclaimed} />
      </div>

      {infoOpen && (
        <ProfileInfoModal
          profile={profile}
          stats={stats}
          memberSinceYear={memberSinceYear}
          onClose={() => setInfoOpen(false)}
        />
      )}

      {musicFilter && (
        <GenreFilterModal
          genre={musicFilter.name}
          artists={filteredArtists}
          picks={filteredPicks}
          onClose={() => setMusicFilter(null)}
        />
      )}

      {moodOpen && moodTrack && (
        <MoodSongModal
          track={moodTrack}
          username={profile.full_name || profile.username}
          onClose={() => setMoodOpen(false)}
        />
      )}

      {moreOpen && (
        <MoreItemsModal
          kind={moreOpen}
          title={
            moreOpen === 'artist' ? 'Visi mėgstami atlikėjai'
            : moreOpen === 'album' ? 'Visi mėgstami albumai'
            : 'Visos mėgstamiausios dainos'
          }
          items={
            moreOpen === 'artist' ? favoriteArtists
            : moreOpen === 'album' ? favoriteAlbums
            : favoriteTracks
          }
          onClose={() => setMoreOpen(null)}
        />
      )}
    </div>
  )
}

function albumMeta(resolved: number, pending: number): string {
  if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')}`
  if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomi · ${pending.toLocaleString('lt-LT')} laukia`
  return `${resolved.toLocaleString('lt-LT')} albumų`
}

function trackMeta(resolved: number, pending: number): string {
  if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')}`
  if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomos · ${pending.toLocaleString('lt-LT')} laukia`
  return `${resolved.toLocaleString('lt-LT')} dainų`
}

// ─────────────────────────────────────────────────────────────────────────────
// Music Identity — equalizer + substyles bendrai
// ─────────────────────────────────────────────────────────────────────────────

function MusicIdentityBlock({
  meter, styles, onSelectGenre, onSelectSubstyle,
}: {
  meter: any
  styles: { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }[]
  onSelectGenre: (genre: string | null) => void
  onSelectSubstyle: (s: { legacyId: number; name: string }) => void
}) {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.10), rgba(96,165,250,0.06), rgba(167,139,250,0.08))',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        padding: '1px',
      }}
    >
      <div
        className="rounded-[24px]"
        style={{ background: 'var(--bg-body)' }}
      >
        {meter && Array.isArray(meter) && meter.length > 0 && (
          <SideEqualizer
            meter={meter}
            selectedGenre={null}
            onSelect={onSelectGenre}
            variant="hero"
          />
        )}

        {styles && styles.length > 0 && (
          <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-1">
            <div
              className="text-[10px] font-extrabold uppercase tracking-[0.18em] mb-3"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}
            >
              Mėgstamiausi stiliai · spauskite, kad pamatytumėte tie stiliai atlikėjus
            </div>
            <SubstyleCloud styles={styles} onSelect={onSelectSubstyle} />
          </div>
        )}
      </div>
    </div>
  )
}

function SubstyleCloud({
  styles, onSelect,
}: {
  styles: { legacy_style_id: number; style_slug: string; style_name: string; sort_order: number }[]
  onSelect: (s: { legacyId: number; name: string }) => void
}) {
  // Size tiers — naudoja sort_order'į svarbiausiems chip'ams išskirti.
  const sizeFor = (i: number): React.CSSProperties => {
    if (i < 3) return { fontSize: '15px', padding: '8px 14px', fontWeight: 800 }
    if (i < 6) return { fontSize: '13px', padding: '6px 11px', fontWeight: 700 }
    if (i < 10) return { fontSize: '12px', padding: '5px 10px', fontWeight: 600, opacity: 0.85 }
    return { fontSize: '11px', padding: '4px 9px', fontWeight: 500, opacity: 0.68 }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {styles.map((s, i) => (
        <button
          key={s.legacy_style_id}
          onClick={() => onSelect({ legacyId: s.legacy_style_id, name: s.style_name })}
          className="rounded-full border transition hover:scale-[1.04] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(249,115,22,0.32)]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            background: 'rgba(255,255,255,0.04)',
            color: '#dde8f8',
            borderColor: 'rgba(255,255,255,0.10)',
            ...sizeFor(i),
          }}
          title={`Rodyti „${s.style_name}" atlikėjus`}
        >
          {s.style_name}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Now Playing
// ─────────────────────────────────────────────────────────────────────────────

function NowPlayingStrip({ track, onClick }: { track: any; onClick: () => void }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const coverImage = artist?.cover_image_url || track.cover_url || null
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-3 sm:gap-4 rounded-2xl px-3.5 sm:px-5 py-2.5 sm:py-3 overflow-hidden text-left transition-all hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(to right, rgba(249,115,22,0.10), rgba(244,114,182,0.05) 60%, transparent)',
        border: '1px solid rgba(249,115,22,0.20)',
      }}
      title="Atidaryti nuotaikos dainą"
    >
      {coverImage && (
        <>
          <div aria-hidden className="absolute inset-0 -z-10 opacity-40"
               style={{ backgroundImage: `url(${coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(50px) saturate(1.5) brightness(0.45)', transform: 'scale(1.4)' }} />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/40 via-black/25 to-black/40" />
        </>
      )}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-1 rounded-full opacity-35"
             style={{ background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)', animation: 'moodSpinV10 14s linear infinite', filter: 'blur(2px)' }} />
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImage} alt="" className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover border border-white/15"
               style={{ animation: 'moodSpinV10 36s linear infinite' }} />
        ) : (
          <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-base">♬</div>
        )}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full"
             style={{ background: 'var(--bg-body)' }} />
      </div>

      <div className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-orange-300" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Nuotaikos daina
        </span>
        <span aria-hidden style={{ color: 'rgba(255,255,255,0.35)' }}>·</span>
        <span className="font-extrabold text-white text-sm sm:text-base truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {track.title}
        </span>
        {artist && (
          <>
            <span aria-hidden style={{ color: 'rgba(255,255,255,0.35)' }}>·</span>
            <span className="font-semibold text-xs sm:text-sm truncate" style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.75)' }}>
              {artist.name}
            </span>
          </>
        )}
      </div>

      <span
        aria-hidden
        className="ml-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs opacity-60 transition group-hover:opacity-100"
        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}
      >
        ▸
      </span>
      <style>{`@keyframes moodSpinV10 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PopBars
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
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur-md px-2.5 py-1 transition-all hover:scale-[1.03] hover:border-white/40 hover:bg-white/20"
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
// Section header
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

// ─────────────────────────────────────────────────────────────────────────────
// Artists Grid (+Daugiau tile)
// ─────────────────────────────────────────────────────────────────────────────

function ArtistsGridWithMore({
  artists, maxShown, onOpenMore, totalCount,
}: {
  artists: any[]; maxShown: number; onOpenMore: () => void; totalCount: number
}) {
  const shown = artists.slice(0, maxShown)
  const remaining = totalCount - shown.length
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
      {shown.map((a: any) => (
        <Link
          key={a.id}
          href={`/atlikejai/${a.slug}`}
          className="group relative aspect-square rounded-xl overflow-hidden"
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
          <p className="absolute bottom-0 left-0 right-0 p-2 sm:p-2.5 text-xs sm:text-sm font-extrabold text-white leading-tight truncate"
             style={{ fontFamily: "'Outfit', sans-serif" }}>
            {a.name}
          </p>
        </Link>
      ))}
      {remaining > 0 && <MoreTile remaining={remaining} onClick={onOpenMore} />}
    </div>
  )
}

function AlbumsGridWithMore({
  albums, maxShown, onOpenMore, totalCount,
}: {
  albums: any[]; maxShown: number; onOpenMore: () => void; totalCount: number
}) {
  const shown = albums.slice(0, maxShown)
  const remaining = totalCount - shown.length
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
      {shown.map((al: any) => {
        const artist = Array.isArray(al.artists) ? al.artists[0] : al.artists
        const href = artist ? `/atlikejai/${artist.slug}/${al.slug || al.id}` : `/lt/albumas/${al.slug || ''}/${al.id}`
        return (
          <Link key={al.id} href={href}
                className="group block rounded-xl overflow-hidden transition hover:scale-[1.03]"
                style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
            <div className="aspect-square w-full overflow-hidden"
                 style={{ background: 'linear-gradient(135deg, var(--border-subtle), var(--card-bg))' }}>
              {al.cover_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={al.cover_url} alt={al.title} className="w-full h-full object-cover transition group-hover:opacity-90" loading="lazy" />
              ) : null}
            </div>
            <div className="p-2">
              <div className="text-[10px] uppercase tracking-wider truncate"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                {artist?.name || '—'}
              </div>
              <div className="text-xs font-semibold leading-tight line-clamp-2 mt-0.5"
                   style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {al.title}
              </div>
            </div>
          </Link>
        )
      })}
      {remaining > 0 && <MoreTile remaining={remaining} onClick={onOpenMore} compact />}
    </div>
  )
}

function TracksGridWithMore({
  tracks, maxShown, onOpenMore, totalCount,
}: {
  tracks: any[]; maxShown: number; onOpenMore: () => void; totalCount: number
}) {
  const shown = tracks.slice(0, maxShown)
  const remaining = totalCount - shown.length
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {shown.map((t: any, i: number) => {
          const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
          const href = artist ? `/atlikejai/${artist.slug}/${t.slug || t.id}` : `/lt/daina/${t.slug || ''}/${t.id}`
          return (
            <Link key={t.id} href={href}
                  className="group flex items-center gap-3 rounded-lg p-2 transition hover:bg-[var(--hover-bg)]"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
              <div className="w-5 text-center text-[11px] font-bold tabular-nums"
                   style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
                {i + 1}
              </div>
              <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0"
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
      {remaining > 0 && (
        <button
          onClick={onOpenMore}
          className="mt-2.5 w-full rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-wider transition hover:scale-[1.01]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--accent-orange)',
          }}
        >
          +{remaining.toLocaleString('lt-LT')} daugiau · filtruoti
        </button>
      )}
    </>
  )
}

function MoreTile({ remaining, onClick, compact }: { remaining: number; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03] hover:border-[var(--accent-orange)]"
      style={{
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-default)',
        color: 'var(--text-secondary)',
      }}
      title={`Atidaryti visus (${remaining})`}
    >
      <span
        className={`${compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'} font-black`}
        style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
      >
        +{remaining.toLocaleString('lt-LT')}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
        daugiau
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Picks — h-scroll su title + komentaras
// ─────────────────────────────────────────────────────────────────────────────

function DailyPicksScrollRow({
  picks, maxShown, totalCount, moreHref,
}: { picks: any[]; maxShown: number; totalCount: number; moreHref: string | null }) {
  const shown = picks.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2.5 sm:gap-3 min-w-max">
        {shown.map((p) => (
          <div key={p.id} className="w-[170px] sm:w-[195px] flex-shrink-0">
            <DailyPicksCards picks={[p]} />
          </div>
        ))}
        {moreHref && remaining > 0 && (
          <Link
            href={moreHref}
            className="w-[170px] sm:w-[195px] flex-shrink-0 aspect-square rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03]"
            style={{
              background: 'var(--card-bg)',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="text-2xl sm:text-3xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              +{remaining.toLocaleString('lt-LT')}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Visa istorija
            </span>
          </Link>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined feed
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
// Recent Comments — Diskusijų aktivumo log'as
// ─────────────────────────────────────────────────────────────────────────────

function RecentCommentsList({ comments }: { comments: any[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {comments.map((c: any) => {
        const { url, title, kind, cover } = resolveCommentEntity(c)
        // Strip HTML tags from content for safe display
        const plain = (c.content_text || c.content_html || '').replace(/<[^>]*>/g, '').trim()
        const snippet = plain.length > 180 ? plain.slice(0, 180) + '…' : plain
        const date = new Date(c.created_at).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })
        return (
          <li key={`${c.entity_type}-${c.id}`}>
            <Link
              href={url || '#'}
              className="group flex gap-3 p-3 sm:p-3.5 rounded-xl transition hover:-translate-y-0.5"
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" loading="lazy" className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
                     style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  💬
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap mb-0.5">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider"
                        style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
                    {kind}
                  </span>
                  <span aria-hidden style={{ color: 'var(--text-faint)' }}>·</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
                    {date}
                  </span>
                  {c.like_count > 0 && (
                    <>
                      <span aria-hidden style={{ color: 'var(--text-faint)' }}>·</span>
                      <span className="text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>♥ {c.like_count}</span>
                    </>
                  )}
                </div>
                {title && (
                  <h4 className="text-sm font-bold leading-tight truncate group-hover:text-[var(--accent-orange)] transition"
                      style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                    {title}
                  </h4>
                )}
                {snippet && (
                  <p className="mt-1 text-[12px] line-clamp-2"
                     style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                    „{snippet}"
                  </p>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function resolveCommentEntity(c: any): { url: string | null; title: string | null; kind: string; cover: string | null } {
  if (c.entity_type === 'track' && c.track) {
    const artist = Array.isArray(c.track.artists) ? c.track.artists[0] : c.track.artists
    return {
      url: artist ? `/atlikejai/${artist.slug}/${c.track.slug || c.track.id}` : `/lt/daina/${c.track.slug || ''}/${c.track.id}`,
      title: artist ? `${artist.name} — ${c.track.title}` : c.track.title,
      kind: 'Daina',
      cover: c.track.cover_url || null,
    }
  }
  if (c.entity_type === 'album' && c.album) {
    const artist = Array.isArray(c.album.artists) ? c.album.artists[0] : c.album.artists
    return {
      url: artist ? `/atlikejai/${artist.slug}/${c.album.slug || c.album.id}` : `/lt/albumas/${c.album.slug || ''}/${c.album.id}`,
      title: artist ? `${artist.name} — ${c.album.title}` : c.album.title,
      kind: 'Albumas',
      cover: c.album.cover_url || null,
    }
  }
  if (c.entity_type === 'artist' && c.artist) {
    return {
      url: `/atlikejai/${c.artist.slug}`,
      title: c.artist.name,
      kind: 'Atlikėjas',
      cover: c.artist.cover_image_url || null,
    }
  }
  if (c.entity_type === 'blog_post' && c.blog_post) {
    const blogSlug = Array.isArray(c.blog_post.blogs) ? c.blog_post.blogs[0]?.slug : c.blog_post.blogs?.slug
    return {
      url: blogSlug ? `/blogas/${blogSlug}/${c.blog_post.slug}` : null,
      title: c.blog_post.title,
      kind: c.blog_post.post_type === 'topas' ? 'Topas' : 'Įrašas',
      cover: c.blog_post.cover_image_url || null,
    }
  }
  return { url: null, title: null, kind: 'Komentaras', cover: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
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
