'use client'

// app/vartotojas/[username]/profile-client.tsx
//
// V11 — 3-col hero + vertikalūs full-width body sekcijos:
//
//   HERO (3 stulpeliai desktop, vertikaliai stacked mobile)
//     L: Avatar + vardas + popbar'ai + „Apie narį" button
//     M: SideEqualizer 'hero-mini' (top 3 bars + 'Kita') + expand ikona
//        → MusicTasteModal (pilnas equalizer + substyles + filtras)
//     R: MoodSongHeroCard (jei profile.mood_song_track_id resolved)
//
//   BODY (full-width vertikaliai)
//     1. Naujausi įrašai — featured + 4 side
//     2. Dienos dainos pasirinkimai — h-scroll
//     3. Mėgstami atlikėjai — bento koliažas (FavoriteArtistsCollage),
//        tile dydžiai pagal liked albums+tracks count
//     4. Mėgstami albumai — grid + quick filter chips (per MoreItemsModal)
//     5. Mėgstamos dainos — YT thumb grid + quick filters
//     6. Naujausi komentarai — activity log

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { SideEqualizer } from '@/components/profile/SideEqualizer'
import { DailyPickCard } from '@/components/profile/DailyPicksCards'
import { ProfileInfoModal } from '@/components/profile/ProfileInfoModal'
import { GenreFilterModal } from '@/components/profile/GenreFilterModal'
import { MoreItemsModal } from '@/components/profile/MoreItemsModal'
import { FavoriteArtistsCollage } from '@/components/profile/FavoriteArtistsCollage'

const POST_TYPE_LABEL: Record<string, string> = {
  article: 'Straipsnis', review: 'Recenzija', event: 'Renginys', creation: 'Kūriniai',
  translation: 'Vertimas', topas: 'Topas', self: 'Apie mane',
}
const POST_TYPE_COLOR: Record<string, string> = {
  article: '#f97316', review: '#fbbf24', event: '#34d399', creation: '#f472b6',
  translation: '#a78bfa', topas: '#60a5fa', self: '#a3a3a3',
}

type SubstyleFilter = { kind: 'substyle'; legacyId: number; name: string }
type GenreFilter = { kind: 'genre'; name: string }
type AnyFilter = SubstyleFilter | GenreFilter

export function ProfileClient(props: any) {
  const {
    profile, favoriteArtists, favoriteStyles, favoriteAlbums, favoriteTracks, likesCounts,
    blog,
    postLanes, postTypeCounts, memberSinceYear, stats, moodTrack, dailyPicks, translations,
    recentComments,
  } = props

  const [infoOpen, setInfoOpen] = useState(false)
  const [tasteOpen, setTasteOpen] = useState(false)
  const [tasteInitial, setTasteInitial] = useState<AnyFilter | null>(null)
  const [moreOpen, setMoreOpen] = useState<'artist' | 'album' | 'track' | null>(null)

  const openTaste = (preGenre?: string | null) => {
    setTasteInitial(preGenre ? { kind: 'genre', name: preGenre } : null)
    setTasteOpen(true)
  }

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

  // V12 (2026-06-02): turinio juostos pagal tipą. page.tsx atsiunčia per-type
  // sample postus (postLanes) + TIKRUS count'us (postTypeCounts). Juosta rodoma
  // tik jei tipas turi įrašų. translation juosta — iš `translations` prop'o.
  const contentLanes = useMemo(() => {
    if (!blog) return [] as { type: string; count: number; posts: any[] }[]
    const byType = new Map<string, any[]>((postLanes || []).map((l: any) => [l.type, l.posts]))
    const lanes: { type: string; count: number; posts: any[] }[] = []
    for (const t of ['article', 'creation', 'topas']) {
      const posts = byType.get(t) || []
      const count = postTypeCounts?.[t] || 0
      if (count > 0 && posts.length > 0) lanes.push({ type: t, count, posts })
    }
    // Vertimai — iš translations prop'o (normalizuojam į post-like shape)
    const trCount = postTypeCounts?.translation || 0
    if (trCount > 0 && (translations?.length || 0) > 0) {
      const trPosts = (translations as any[]).map((t) => {
        const tslug = Array.isArray(t.blogs) ? t.blogs[0]?.slug : t.blogs?.slug
        const targetArtist = Array.isArray(t.target_artist) ? t.target_artist[0] : t.target_artist
        const targetTrack = Array.isArray(t.target_track) ? t.target_track[0] : t.target_track
        return {
          id: t.id, slug: t.slug, title: t.title,
          summary: targetArtist ? `${targetArtist.name}${targetTrack ? ' — ' + targetTrack.title : ''}` : null,
          cover_image_url: null,
          published_at: t.published_at || t.created_at,
          post_type: 'translation', display_post_type: 'translation',
          like_count: t.like_count || 0, comment_count: t.comment_count || 0,
          _blogSlug: tslug,
        }
      })
      lanes.push({ type: 'translation', count: trCount, posts: trPosts })
    }
    return lanes
  }, [blog, postLanes, postTypeCounts, translations])

  // V11: filtravimas dabar gyvena modal'e (GenreFilterModal), čia tik
  // perduodam pilnus sąrašus (favoriteArtists + dailyPicks) + initialFilter.

  // V11.2: ilgesnė bio ištrauka identity stulpeliui — pirmas paragrafas iki
  // ~220 simbolių (line-clamp-3 nutrina vizualiai jei reikia).
  const bioSnippet = useMemo(() => {
    if (!profile.bio) return null
    const firstPara = (profile.bio as string).split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim()
    if (!firstPara) return null
    if (firstPara.length <= 220) return firstPara
    return firstPara.slice(0, 217).replace(/\s+\S*$/, '') + '…'
  }, [profile.bio])

  // V11.2: real photo iš legacy_profile_photos array'aus (rezervuota
  // ProfileInfoModal'ui kaip pilna galerija; čia tik pirma — kaip portretas).
  // V11.7: pirmas photo gali būti generic placeholder (male/female/anonymous/none)
  // iš music.lt lankytojai/ — filtruojam tuos, kad nerodom „lyties" foto.
  const realPhotoUrl = useMemo<string | null>(() => {
    const photos = profile.legacy_profile_photos
    if (!Array.isArray(photos) || photos.length === 0) return null
    const first = photos[0]
    const url = first?.thumb_url || first?.url || null
    if (!url) return null
    if (/\/(?:male|female|anonymous|none)\.(jpe?g|png|gif)(?:[?#]|$)/i.test(url)) return null
    return url
  }, [profile.legacy_profile_photos])

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

        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 lg:pt-9 pb-5 sm:pb-6 lg:pb-7">

          {/* ─── MOBILE LAYOUT (V11.5): kuo kompaktiškiau ─── */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <h1
                  className="font-black leading-[0.95] tracking-[-0.04em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] truncate"
                  style={{ fontSize: 'clamp(1.35rem, 6vw, 1.8rem)', fontFamily: "'Outfit', sans-serif" }}
                >
                  {profile.username}
                </h1>
                {(karmaLevel > 0 || activityLevel > 0) && (
                  <div className="mt-1.5 flex items-center gap-1.5 flex-nowrap">
                    {karmaLevel > 0 && (
                      <PopBarChip
                        level={karmaLevel}
                        title="Karma"
                        delayMs={350}
                        icon={
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                            <path d="M12 2l2.39 7.36H22l-6.18 4.48L18.21 22 12 17.27 5.79 22l2.39-8.16L2 9.36h7.61z" />
                          </svg>
                        }
                      />
                    )}
                    {activityLevel > 0 && (
                      <PopBarChip
                        level={activityLevel}
                        title="Aktyvumas"
                        delayMs={1730}
                        revealDelayMs={1450}
                        icon={
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
                          </svg>
                        }
                      />
                    )}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInfoOpen(true)}
                    className="text-[11px] font-bold transition hover:opacity-80"
                    style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
                  >
                    Daugiau →
                  </button>
                  <ShareButton username={profile.username} />
                </div>
              </div>

              {moodTrack && (
                <MobileMoodPill track={moodTrack} />
              )}
            </div>

            <div className="mt-4">
              {hasMusicMeter ? (
                <SideEqualizer
                  meter={profile.legacy_music_meter}
                  variant="hero-mini"
                  topN={8}
                  mobileTopN={4}
                  onExpand={(g) => openTaste(g)}
                />
              ) : (
                <EqualizerPlaceholder onClick={() => openTaste()} />
              )}
            </div>
          </div>

          {/* ─── DESKTOP LAYOUT (lg+): 3-col grid — V11.6: SWAPPED mood ↔ eq
              (mood viduryje, equalizer dešinėj). Jei mood nėra, equalizer span'ina
              ant abiejų stulpelių, kad nebūtų tuščios vietos. ─── */}
          <div className={`hidden lg:grid gap-5 items-stretch ${moodTrack ? 'lg:grid-cols-[1.05fr_0.8fr_1.65fr]' : 'lg:grid-cols-[1.05fr_2.45fr]'}`}>

            <div className="flex flex-col gap-3">
              <div className="flex flex-row items-start gap-3.5">
                {realPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={realPhotoUrl}
                    alt=""
                    className="w-[76px] h-[76px] rounded-2xl object-cover shadow-[0_6px_24px_rgba(0,0,0,0.5)] flex-shrink-0"
                    style={{ borderWidth: '2px', borderStyle: 'solid', borderColor: 'rgba(255,255,255,0.12)' }}
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <h1
                    className="font-black leading-[1.0] tracking-[-0.04em] text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
                    style={{ fontSize: 'clamp(1.45rem, 3vw, 2.1rem)', fontFamily: "'Outfit', sans-serif" }}
                  >
                    {profile.username}
                  </h1>

                  {(karmaLevel > 0 || activityLevel > 0) && (
                    <div className="mt-2 flex items-center gap-2 flex-nowrap">
                      {karmaLevel > 0 && (
                        <PopBarChip
                          level={karmaLevel}
                          title="Karma — istoriniai music.lt taškai"
                          delayMs={350}
                          icon={
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
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
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--accent-orange)]" aria-hidden>
                              <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
                            </svg>
                          }
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {bioSnippet && (
                <p
                  className="text-[13px] leading-relaxed line-clamp-3"
                  style={{
                    fontFamily: "'Outfit', sans-serif",
                    color: 'rgba(255,255,255,0.78)',
                  }}
                >
                  {bioSnippet}
                </p>
              )}

              <div className="flex items-center gap-2.5 self-start">
                <button
                  type="button"
                  onClick={() => setInfoOpen(true)}
                  className="text-sm font-bold transition hover:opacity-80"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
                >
                  Daugiau →
                </button>
                <ShareButton username={profile.username} />
              </div>
            </div>

            {/* Mood (viduryje, tik jei moodTrack yra) */}
            {moodTrack && (
              <div>
                <MoodSongHeroCard track={moodTrack} />
              </div>
            )}

            {/* Equalizer (dešinėj, span'ina 2 cols jei mood absent) */}
            <div>
              {hasMusicMeter ? (
                <SideEqualizer
                  meter={profile.legacy_music_meter}
                  variant="hero-mini"
                  topN={8}
                  onExpand={(g) => openTaste(g)}
                />
              ) : (
                <EqualizerPlaceholder onClick={() => openTaste()} />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═════════════════ BODY ═════════════════ */}
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-20">

        {/* ĮRAŠAI — V12: turinio juostos pagal tipą (Dienoraštis / Kūryba /
            Topai / Vertimai). Tikri count'ai, tuščio tipo juostos nerodom. */}
        {blog && contentLanes.map((lane) => (
          <PostLane key={lane.type} lane={lane} blogSlug={blog.slug} />
        ))}

        {/* DIENOS DAINOS PASIRINKIMAI */}
        {dailyPicks.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Dienos dainos pasirinkimai"
              meta={`${stats.daily_picks.toLocaleString('lt-LT')} dienų ši kolekcija auga`}
              link={stats.daily_picks > 12 ? { href: `/@${profile.username}/dienos-dainos`, label: 'Visa istorija →' } : undefined}
            />
            <DailyPicksScrollRow
              picks={dailyPicks}
              maxShown={12}
              totalCount={stats.daily_picks}
              moreHref={stats.daily_picks > 12 ? `/@${profile.username}/dienos-dainos` : null}
            />
          </section>
        )}

        {/* MĖGSTAMI ATLIKĖJAI — bento koliažas */}
        {favoriteArtists.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstami atlikėjai"
              meta={`${favoriteArtists.length} atlikėjų${favoriteArtists.some((a: any) => (a.affinity_score || 0) > 0) ? ' · dydis pagal pamėgtų albumų + dainų' : ''}`}
            />
            <FavoriteArtistsCollage
              artists={favoriteArtists}
              maxShown={11}
              totalCount={favoriteArtists.length}
              onOpenMore={() => setMoreOpen('artist')}
            />
          </section>
        )}

        {/* MĖGSTAMI ALBUMAI — V11.7: rodome ir kai legacy_liked_albums_count
            yra, net jei pending=0 (galimas user_username case mismatch
            likes lentelei) */}
        {/* V12 (#6): rodom TIK kai yra realių įrašų — jokių pending-only
            placeholder'ių, kad reti profiliai atrodytų užpildyti turima info. */}
        {favoriteAlbums.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstami albumai"
              meta={albumMeta(albumResolvedTotal, likesCounts?.album?.pending || 0, profile.legacy_liked_albums_count)}
            />
            <AlbumsFullWidth
              albums={favoriteAlbums}
              maxShown={12}
              onOpenMore={() => setMoreOpen('album')}
              totalCount={albumResolvedTotal}
            />
          </section>
        )}

        {/* MĖGSTAMOS DAINOS */}
        {favoriteTracks.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Mėgstamos dainos"
              meta={trackMeta(trackResolvedTotal, likesCounts?.track?.pending || 0, profile.legacy_liked_tracks_count)}
            />
            <TracksFullWidth
              tracks={favoriteTracks}
              maxShown={12}
              onOpenMore={() => setMoreOpen('track')}
              totalCount={trackResolvedTotal}
            />
          </section>
        )}

        {/* NAUJAUSI KOMENTARAI — activity log */}
        {recentComments && recentComments.length > 0 && (
          <section className="mt-8 sm:mt-10">
            <SectionHeader
              title="Naujausi komentarai"
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

      {tasteOpen && (
        <GenreFilterModal
          initialFilter={tasteInitial}
          meter={profile.legacy_music_meter}
          styles={favoriteStyles || []}
          artists={favoriteArtists}
          picks={dailyPicks}
          onClose={() => { setTasteOpen(false); setTasteInitial(null) }}
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

function albumMeta(resolved: number, pending: number, legacyCount?: number | null): string {
  if (resolved === 0 && pending === 0 && (legacyCount || 0) > 0) {
    return `dar laukia migracijos · ${legacyCount!.toLocaleString('lt-LT')} senoj music.lt`
  }
  if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')}`
  if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomi · ${pending.toLocaleString('lt-LT')} laukia`
  return `${resolved.toLocaleString('lt-LT')} albumų`
}

function trackMeta(resolved: number, pending: number, legacyCount?: number | null): string {
  if (resolved === 0 && pending === 0 && (legacyCount || 0) > 0) {
    return `dar laukia migracijos · ${legacyCount!.toLocaleString('lt-LT')} senoj music.lt`
  }
  if (resolved === 0 && pending > 0) return `dar laukia ${pending.toLocaleString('lt-LT')}`
  if (pending > 0) return `${resolved.toLocaleString('lt-LT')} matomos · ${pending.toLocaleString('lt-LT')} laukia`
  return `${resolved.toLocaleString('lt-LT')} dainų`
}

// ─────────────────────────────────────────────────────────────────────────────
// V12: Dalintis mygtukas — native share (mobile) → clipboard fallback. /@username.
// ─────────────────────────────────────────────────────────────────────────────
function ShareButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  const onClick = async () => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/@${username}`
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: `${username} — music.lt`, url })
        return
      }
    } catch { /* user cancelled — fall through to copy */ }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dalintis profiliu"
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition hover:opacity-90"
      style={{ fontFamily: "'Outfit', sans-serif", background: 'rgba(255,255,255,0.13)', color: '#fff', border: '1px solid rgba(255,255,255,0.24)' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      {copied ? 'Nukopijuota' : 'Dalintis'}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// V11 Hero column placeholders + Mood Song hero card
// ─────────────────────────────────────────────────────────────────────────────

// V11.5: mobile compact mood pill — circle cover + title/artist inline; clickable.
// V11.6: YT thumb fallback + modern /dainos/ URL.
function MobileMoodPill({ track }: { track: any }) {
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const ytThumb = ytThumbProfile(track.video_url)
  const cover = ytThumb || track.cover_url || artist?.cover_image_url || null
  const href = artist
    ? `/dainos/${artist.slug}-${track.slug || track.id}-${track.id}`
    : `/dainos/${track.slug || ''}-${track.id}`
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 px-2.5 py-1.5 rounded-full flex-shrink-0 max-w-[60%]"
      style={{
        background: 'linear-gradient(to right, rgba(249,115,22,0.18), rgba(244,114,182,0.08))',
        border: '1px solid rgba(249,115,22,0.30)',
      }}
      title={`${track.title}${artist ? ' — ' + artist.name : ''}`}
    >
      <div className="relative w-8 h-8 flex-shrink-0">
        <div className="absolute -inset-0.5 rounded-full opacity-50"
             style={{
               background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #f97316)',
               animation: 'moodSpinV11 14s linear infinite',
               filter: 'blur(2px)',
             }} />
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="relative w-8 h-8 rounded-full object-cover border border-white/15"
               style={{ animation: 'moodSpinV11 36s linear infinite' }} />
        ) : (
          <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-[10px]">♬</div>
        )}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
             style={{ background: 'var(--bg-body)' }} />
      </div>
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[8.5px] font-extrabold uppercase tracking-[0.15em] text-orange-300"
              style={{ fontFamily: "'Outfit', sans-serif" }}>
          Nuotaika
        </span>
        <span className="text-[11px] font-bold text-white truncate"
              style={{ fontFamily: "'Outfit', sans-serif", maxWidth: '180px' }}>
          {track.title}
        </span>
      </div>
    </Link>
  )
}

function MoodSongHeroCard({ track }: { track: any }) {
  // V11.6: cover priority — track YT thumb pirma (jei video_url), tada
  // track.cover_url, tada artist'o cover (fallback). Play ikonos kampe
  // nebėra (user feedback'as: per daug vizualinio triukšmo). Click → modern
  // /dainos/{slug-id} URL'as (ne /atlikejai/ kuris 404'ina).
  const artist = Array.isArray(track.artists) ? track.artists[0] : track.artists
  const ytThumb = ytThumbProfile(track.video_url)
  const cover = ytThumb || track.cover_url || artist?.cover_image_url || null
  const href = artist
    ? `/dainos/${artist.slug}-${track.slug || track.id}-${track.id}`
    : `/dainos/${track.slug || ''}-${track.id}`

  return (
    <Link
      href={href}
      className="group relative w-full h-full rounded-2xl border overflow-hidden flex flex-col text-left transition hover:-translate-y-0.5"
      style={{
        background: 'linear-gradient(135deg, var(--card-bg), transparent 80%)',
        borderColor: 'var(--border-subtle)',
        minHeight: '180px',
      }}
      title={`${track.title}${artist ? ' — ' + artist.name : ''} · atidaryti dainos puslapį`}
    >
      <div className="p-3 sm:p-4 pb-1">
        <div
          className="font-extrabold uppercase"
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '10px',
            letterSpacing: '0.22em',
            color: 'var(--accent-orange)',
          }}
        >
          Nuotaikos daina
        </div>
      </div>

      <div className="flex-1 flex items-center gap-3.5 px-3.5 sm:px-4 pb-3.5 sm:pb-4 pt-1.5">
        <div className="relative flex-shrink-0">
          <div className="absolute -inset-1 rounded-full opacity-45"
               style={{
                 background: 'conic-gradient(from 0deg, #f97316, #dc2626, #a78bfa, #60a5fa, #34d399, #fbbf24, #f97316)',
                 animation: 'moodSpinV11 16s linear infinite',
                 filter: 'blur(3px)',
               }} />
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="relative w-[78px] h-[78px] rounded-full object-cover border-2 border-white/15"
                 style={{ animation: 'moodSpinV11 40s linear infinite' }} />
          ) : (
            <div className="relative w-[78px] h-[78px] rounded-full bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-2xl"
                 style={{ color: 'rgba(255,255,255,0.7)' }}>♬</div>
          )}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
               style={{ background: 'var(--bg-body)' }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-extrabold leading-[1.15] line-clamp-2 group-hover:text-orange-200 transition"
               style={{
                 fontFamily: "'Outfit', sans-serif",
                 fontSize: 'clamp(1rem, 1.5vw, 1.2rem)',
                 color: 'var(--text-primary)',
               }}>
            {track.title}
          </div>
          {artist && (
            <div className="mt-1 font-semibold text-[12px] sm:text-[13px] truncate"
                 style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-secondary)' }}>
              {artist.name}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes moodSpinV11 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Link>
  )
}


function MoodSongPlaceholder() {
  return (
    <div
      className="w-full h-full rounded-2xl flex flex-col items-center justify-center text-center px-4 py-5"
      style={{
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-default)',
        minHeight: '180px',
      }}
    >
      <span className="text-2xl mb-1.5" style={{ opacity: 0.4 }}>♬</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
        Nuotaikos daina
      </span>
      <span className="mt-1 text-[11px] leading-snug"
            style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        Narys dar nepasirinko
      </span>
    </div>
  )
}

function EqualizerPlaceholder({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-full rounded-2xl flex flex-col items-center justify-center text-center px-4 py-5 transition hover:opacity-90"
      style={{
        background: 'var(--card-bg)',
        border: '1px dashed var(--border-default)',
        minHeight: '180px',
      }}
    >
      <span className="text-2xl mb-1.5" style={{ opacity: 0.4 }}>📊</span>
      <span className="text-[10px] font-extrabold uppercase tracking-wider"
            style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
        Muzikinis skonis
      </span>
      <span className="mt-1 text-[11px] leading-snug"
            style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        Skonio matas dar nesurinktas
      </span>
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
  // V11.3: span (ne button) — popbar'ai neturi click action'o; lieka kaip
  // grynas vizualus ženkliukas; tooltip per title attr'ą.
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur-md px-2 py-0.5"
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
      <PopBar level={level} size="sm" animate delayMs={delayMs} />
      <style>{`
        @keyframes popChipReveal {
          0%   { opacity: 0; transform: translateY(4px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </span>
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

// V11.6: LT plural helper. Pagal paskutinį skaitmenį + paskutinius 2 sk:
//   1, 21, 31, ... (bet ne 11) → singular
//   2-9, 22-29, ... (bet ne 12-19) → paucal
//   0, 10, 11..19, 20, 30, 40, ... → genitive plural
function ltPlural(n: number, sg: string, paucal: string, gen: string): string {
  const lastTwo = Math.abs(n) % 100
  const last = Math.abs(n) % 10
  if (last === 1 && lastTwo !== 11) return sg
  if (last >= 2 && last <= 9 && (lastTwo < 10 || lastTwo > 19)) return paucal
  return gen
}

// Plural forms per post type — [singular, paucal, genitive-plural].
const POST_TYPE_PLURAL: Record<string, [string, string, string]> = {
  article:     ['straipsnis', 'straipsniai', 'straipsnių'],
  review:      ['recenzija',  'recenzijos',  'recenzijų'],
  event:       ['renginys',   'renginiai',   'renginių'],
  creation:    ['kūrinys',    'kūriniai',    'kūrinių'],
  translation: ['vertimas',   'vertimai',    'vertimų'],
  topas:       ['topas',      'topai',       'topų'],
}

// V11.5 → V11.6: tag chips refresh. Sentence case (be uppercase), LT plural
// forms („60 straipsnių" / „2 vertimai" / „1 recenzija"), „Visi" → „Visi įrašai".
// Pridėtas „self" tipas (post.post_type='article' BE music attachments) →
// „Apie mane" tag.
function PostTypeTagBar({
  counts, current, total, onChange, allInUrl,
}: {
  counts: Record<string, number>
  current: string | null
  total: number
  onChange: (type: string | null) => void
  allInUrl?: { href: string; label: string }
}) {
  const TYPE_ORDER = ['article', 'review', 'event', 'topas', 'creation', 'translation', 'self']
  const items: { key: string | null; label: string; count: number }[] = [
    { key: null, label: 'Visi įrašai', count: total },
  ]
  for (const t of TYPE_ORDER) {
    const n = counts[t]
    if (!n || n === 0) continue
    let label: string
    if (t === 'self') {
      label = `Apie mane · ${n}`
    } else {
      const forms = POST_TYPE_PLURAL[t]
      if (forms) {
        label = `${n} ${ltPlural(n, forms[0], forms[1], forms[2])}`
      } else {
        label = `${POST_TYPE_LABEL[t] || t} · ${n}`
      }
    }
    items.push({ key: t, label, count: n })
  }
  // Kiti nežinomi tipai
  for (const t of Object.keys(counts)) {
    if (!TYPE_ORDER.includes(t) && counts[t] > 0) {
      items.push({ key: t, label: `${POST_TYPE_LABEL[t] || t} · ${counts[t]}`, count: counts[t] })
    }
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        {items.map((it) => {
          const isActive = it.key === current
          const typeColor = it.key ? (POST_TYPE_COLOR[it.key] || '#f97316') : '#f97316'
          return (
            <button
              key={it.key ?? 'all'}
              type="button"
              onClick={() => onChange(it.key)}
              className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold transition hover:opacity-90"
              style={{
                fontFamily: "'Outfit', sans-serif",
                background: isActive ? `${typeColor}26` : 'transparent',
                color: isActive ? typeColor : 'var(--text-secondary)',
                border: `1px solid ${isActive ? typeColor + '60' : 'var(--border-subtle)'}`,
              }}
            >
              {it.label}
            </button>
          )
        })}
      </div>
      {allInUrl && (
        <Link href={allInUrl.href} className="text-xs sm:text-sm font-bold transition hover:opacity-80"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
          {allInUrl.label}
        </Link>
      )}
    </div>
  )
}

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
// V11 Albums + Tracks full-width sections
// ─────────────────────────────────────────────────────────────────────────────

const YT_REGEX_PROFILE = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/
function ytThumbProfile(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null
  const m = videoUrl.match(YT_REGEX_PROFILE)
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
}

function AlbumsFullWidth({
  albums, maxShown, onOpenMore, totalCount,
}: {
  albums: any[]; maxShown: number; onOpenMore: () => void; totalCount: number
}) {
  // Default sort'as: pagal liked_track_count desc, kad „turtingiausi" albumai būtų priekyje
  const sorted = useMemo(() => {
    return [...albums].sort((a: any, b: any) => (b.liked_track_count || 0) - (a.liked_track_count || 0))
  }, [albums])
  const shown = sorted.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map((al: any) => {
          const artist = Array.isArray(al.artists) ? al.artists[0] : al.artists
          const href = artist ? `/atlikejai/${artist.slug}/${al.slug || al.id}` : `/lt/albumas/${al.slug || ''}/${al.id}`
          const lc = al.liked_track_count || 0
          return (
            <Link key={al.id} href={href}
                  className="group block rounded-xl overflow-hidden transition hover:-translate-y-0.5"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
              <div className="relative aspect-square w-full overflow-hidden"
                   style={{ background: 'linear-gradient(135deg, var(--border-subtle), var(--card-bg))' }}>
                {al.cover_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={al.cover_url} alt={al.title} className="w-full h-full object-cover transition group-hover:scale-105" loading="lazy" />
                ) : null}
                {lc > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold"
                       style={{ background: 'rgba(0,0,0,0.55)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.35)' }}>
                    ♥ {lc} dn.
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <div className="text-[10px] uppercase tracking-wider truncate"
                     style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                  {artist?.name || '—'}
                </div>
                <div className="text-sm font-semibold leading-tight line-clamp-2 mt-0.5"
                     style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                  {al.title}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onOpenMore}
          className="mt-3 w-full rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-wider transition hover:scale-[1.005]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--accent-orange)',
          }}
        >
          +{remaining.toLocaleString('lt-LT')} daugiau · filtruoti, rikiuoti
        </button>
      )}
    </>
  )
}

function TracksFullWidth({
  tracks, maxShown, onOpenMore, totalCount,
}: {
  tracks: any[]; maxShown: number; onOpenMore: () => void; totalCount: number
}) {
  const shown = tracks.slice(0, maxShown)
  const remaining = Math.max(totalCount - shown.length, 0)
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map((t: any) => {
          const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
          const href = artist ? `/atlikejai/${artist.slug}/${t.slug || t.id}` : `/lt/daina/${t.slug || ''}/${t.id}`
          const thumb = ytThumbProfile(t.video_url) || t.cover_url || artist?.cover_image_url || null
          return (
            <Link key={t.id} href={href}
                  className="group block rounded-xl overflow-hidden transition hover:-translate-y-0.5"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}>
              <div className="relative aspect-video w-full overflow-hidden"
                   style={{ background: 'linear-gradient(135deg, var(--border-subtle), var(--card-bg))' }}>
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt={t.title} className="w-full h-full object-cover transition group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: 'var(--text-faint)' }}>♬</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                {t.like_count > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full backdrop-blur-md text-[10px] font-extrabold"
                       style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.92)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    ♥ {t.like_count}
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <div className="text-[10px] uppercase tracking-wider truncate"
                     style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                  {artist?.name || '—'}
                </div>
                <div className="text-sm font-semibold leading-tight line-clamp-2 mt-0.5"
                     style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                  {t.title}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onOpenMore}
          className="mt-3 w-full rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-wider transition hover:scale-[1.005]"
          style={{
            fontFamily: "'Outfit', sans-serif",
            background: 'var(--card-bg)',
            border: '1px dashed var(--border-default)',
            color: 'var(--accent-orange)',
          }}
        >
          +{remaining.toLocaleString('lt-LT')} daugiau · filtruoti, rikiuoti
        </button>
      )}
    </>
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
  // V11.7: korteles platesnės (240/260px), kad naujasis 16:9 thumb + tekstai
  // graziai išsidėliotų. Pakeitė anksčiau buvusį 1:1 ratio 170/195px.
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-2.5 sm:gap-3 min-w-max items-stretch">
        {shown.map((p) => (
          <div key={p.id} className="w-[230px] sm:w-[250px] flex-shrink-0">
            <DailyPickCard pick={p} />
          </div>
        ))}
        {moreHref && remaining > 0 && (
          <Link
            href={moreHref}
            className="w-[180px] flex-shrink-0 rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03] p-4"
            style={{
              background: 'var(--card-bg)',
              border: '1px dashed var(--border-default)',
              color: 'var(--text-secondary)',
            }}
          >
            <span className="text-2xl sm:text-3xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
              +{remaining.toLocaleString('lt-LT')}
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
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

// V11.1: vienodinta post metadata juosta — datum + like + comment ikonomis
// (SVG, ne emoji), kad nesimaišytų contextually.
function PostMetaRow({
  date, likes, comments, tone = 'light',
}: {
  date: string
  likes: number
  comments: number
  tone?: 'light' | 'muted'
}) {
  const color = tone === 'light' ? 'rgba(255,255,255,0.72)' : 'var(--text-faint)'
  return (
    <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-wider font-bold"
         style={{ color, fontFamily: "'Outfit', sans-serif" }}>
      <span>{new Date(date).toLocaleDateString('lt-LT', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
      {likes > 0 && (
        <span className="inline-flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
          {likes}
        </span>
      )}
      {comments > 0 && (
        <span className="inline-flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {comments}
        </span>
      )}
    </div>
  )
}

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

// ─────────────────────────────────────────────────────────────────────────────
// V12: Turinio juostos pagal tipą (Dienoraštis / Kūryba / Topai / Vertimai)
// ─────────────────────────────────────────────────────────────────────────────

const LANE_LABEL: Record<string, string> = {
  article: 'Dienoraštis', creation: 'Kūryba', topas: 'Topai', translation: 'Vertimai',
}
const LANE_COUNT_PLURAL: Record<string, [string, string, string]> = {
  article: ['įrašas', 'įrašai', 'įrašų'],
  creation: ['kūrinys', 'kūriniai', 'kūrinių'],
  topas: ['topas', 'topai', 'topų'],
  translation: ['vertimas', 'vertimai', 'vertimų'],
}

function PostLane({ lane, blogSlug }: { lane: { type: string; count: number; posts: any[] }; blogSlug: string }) {
  const label = LANE_LABEL[lane.type] || lane.type
  const forms = LANE_COUNT_PLURAL[lane.type]
  const meta = forms
    ? `${lane.count.toLocaleString('lt-LT')} ${ltPlural(lane.count, forms[0], forms[1], forms[2])}`
    : `${lane.count}`
  const remaining = Math.max(lane.count - lane.posts.length, 0)
  const allHref = `/blogas/${blogSlug}`
  return (
    <section className="mt-8 sm:mt-10">
      <SectionHeader title={label} meta={meta} link={remaining > 0 ? { href: allHref, label: 'Visi →' } : undefined} />
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3 sm:gap-3.5 min-w-max items-stretch">
          {lane.posts.map((p) => (
            <div key={`${lane.type}-${p.id}`} className="w-[230px] sm:w-[250px] flex-shrink-0">
              <PostLaneCard post={p} blogSlug={blogSlug} laneType={lane.type} />
            </div>
          ))}
          {remaining > 0 && (
            <Link href={allHref}
                  className="w-[150px] flex-shrink-0 rounded-xl flex flex-col items-center justify-center transition hover:scale-[1.03] p-4"
                  style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-default)', color: 'var(--text-secondary)' }}>
              <span className="text-2xl font-black" style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}>
                +{remaining.toLocaleString('lt-LT')}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Visi įrašai
              </span>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

function PostLaneCard({ post, blogSlug, laneType }: { post: any; blogSlug: string; laneType: string }) {
  const url = postUrl(post, blogSlug)
  const thumb = post.cover_image_url || post.fallback_thumb_url || null
  const items = Array.isArray(post.list_items) ? post.list_items : null
  const isTranslation = laneType === 'translation'

  let kicker: string
  if (laneType === 'creation') kicker = post.creation_subtype || 'Kūryba'
  else if (laneType === 'topas') kicker = items && items.length ? `Topas · ${items.length}` : 'Topas'
  else if (isTranslation) kicker = 'Vertimas'
  else kicker = post.display_post_type === 'self' ? 'Apie mane' : 'Straipsnis'
  const initial = (LANE_LABEL[laneType] || '?')[0]

  return (
    <Link href={url} className="group flex flex-col no-underline h-full">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--cover-placeholder)] shadow-[0_4px_12px_rgba(0,0,0,0.25)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-[rgba(249,115,22,0.5)] group-hover:shadow-[0_14px_32px_rgba(249,115,22,0.18)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" style={{ filter: 'saturate(1.05) contrast(1.02)' }} />
        ) : items && items.length >= 4 ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full w-full">
            {items.slice(0, 4).map((it: any, i: number) => (
              <div key={i} className="overflow-hidden" style={{ background: 'var(--bg-body)' }}>
                {it.image_url
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" />}
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl font-black"
               style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-faint)' }}>{initial}</div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(249,115,22,0.10)] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md backdrop-blur-sm text-[9px] font-extrabold uppercase tracking-wider text-white truncate max-w-[88%]"
             style={{ background: 'rgba(0,0,0,0.55)' }}>
          {kicker}
        </div>
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="m-0 line-clamp-2 font-['Outfit',sans-serif] text-[13px] font-extrabold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-orange)]">
          {post.title}
        </p>
        {isTranslation ? (
          post.summary && (
            <p className="m-0 mt-1 truncate text-[11px] text-[var(--text-muted)]">{post.summary}</p>
          )
        ) : (
          <PostMetaRow date={post.published_at} likes={post.like_count || 0} comments={post.comment_count || 0} tone="muted" />
        )}
      </div>
    </Link>
  )
}

function FeaturedPostCard({ post, blogSlug }: { post: any; blogSlug: string }) {
  const url = postUrl(post, blogSlug)
  const typeKey = post.display_post_type || post.post_type
  const typeColor = POST_TYPE_COLOR[typeKey] || '#f97316'
  const typeLabel = POST_TYPE_LABEL[typeKey] || typeKey
  const items = Array.isArray(post.list_items) && post.list_items.length > 0 ? post.list_items : null
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
          <PostMetaRow
            date={post.published_at}
            likes={post.like_count || 0}
            comments={post.comment_count || 0}
            tone="light"
          />
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
  const typeKey = post.display_post_type || post.post_type
  const typeColor = POST_TYPE_COLOR[typeKey] || '#5e7290'
  const typeLabel = POST_TYPE_LABEL[typeKey] || typeKey
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
        <PostMetaRow
          date={post.published_at}
          likes={post.like_count || 0}
          comments={post.comment_count || 0}
          tone="muted"
        />
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
