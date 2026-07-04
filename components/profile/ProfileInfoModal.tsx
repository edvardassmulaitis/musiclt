'use client'

// components/profile/ProfileInfoModal.tsx
//
// V7 — modalas additional stats / bio / occupation atvaizdavimui. Hero
// neturi būti perkrautas skaičiais; visi „papildomi" duomenys gyvena čia.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

type Stats = {
  diary?: number
  translate?: number
  creation?: number
  daily_picks?: number
  comments_received?: number
}

export function ProfileInfoModal({
  profile,
  stats,
  memberSinceYear,
  onClose,
}: {
  profile: any
  stats: Stats
  memberSinceYear: number
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full transition hover:opacity-80"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}
          aria-label="Uždaryti"
        >
          <span style={{ color: 'var(--text-secondary)' }}>✕</span>
        </button>

        <div className="p-6 sm:p-8">
          <ProfileAboutContent profile={profile} stats={stats} memberSinceYear={memberSinceYear} showHeader />
        </div>
      </div>
    </div>,
    document.body
  )
}

// V13 — iškelta į atskirą komponentą, kad „Apie mane" mobile tab'as galėtų
// rodyti TĄ PATĮ turinį inline (be modalo). showHeader=false praleidžia
// avatar/vardą (mobile profilis jau turi header'į virš tab'ų).
export function ProfileAboutContent({
  profile, stats, memberSinceYear, showHeader = false, compact = false, hideLegacy = false, wide = false,
}: {
  profile: any
  stats: Stats
  memberSinceYear: number
  showHeader?: boolean
  compact?: boolean
  // V18: hideLegacy — nerodom archyvinės statistikos (forumo žinutės, vidut.
  // balai, prisijungimai) nei „iš senos music.lt" pastabos. Naudojama profilio
  // inline „Apie mane" rodinyje.
  hideLegacy?: boolean
  // V18d: wide — pilno pločio desktop išdėstymas (sekcijos teka į 2 stulpelius),
  // mažiau vertikalaus scroll'o. Naudojama profilio inline „Apie mane".
  wide?: boolean
}) {
  const secMb = wide ? '' : (compact ? 'mb-3.5' : 'mb-5')
  const statGrid = compact ? 'grid grid-cols-3 gap-2 mt-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2'
  const sigClean = profile.legacy_signature?.replace(/^["„]|["""]$/g, '') ?? ''
  const birth = profile.legacy_birth_date ? new Date(profile.legacy_birth_date) : null
  const age = birth
    ? Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null

  const photos: { url: string; thumb_url?: string; caption?: string | null }[] =
    Array.isArray(profile.legacy_profile_photos) ? profile.legacy_profile_photos : []
  const isLegacy = profile.provider === 'legacy_forum' || !!profile.legacy_user_id
  const isUnclaimed = !profile.is_claimed
  const displayDifferent =
    profile.full_name && profile.username && profile.full_name.toLowerCase() !== profile.username.toLowerCase()

  const rows: { label: string; value: string }[] = []
  if (profile.legacy_message_count != null) rows.push({ label: 'Žinučių forume', value: profile.legacy_message_count.toLocaleString('lt-LT') })
  if (profile.legacy_login_count != null) rows.push({ label: 'Prisijungimų', value: profile.legacy_login_count.toLocaleString('lt-LT') })
  if (profile.legacy_avg_message_len != null) rows.push({ label: 'Vidut. žinutės ilgis', value: `${Math.round(profile.legacy_avg_message_len)} simb.` })
  if (profile.legacy_vote_avg_track != null) rows.push({ label: 'Dainos vidut. balas', value: profile.legacy_vote_avg_track.toFixed(2) })
  if (profile.legacy_vote_avg_album != null) rows.push({ label: 'Albumo vidut. balas', value: profile.legacy_vote_avg_album.toFixed(2) })
  if (profile.legacy_vote_avg_artist != null) rows.push({ label: 'Atlikėjo vidut. balas', value: profile.legacy_vote_avg_artist.toFixed(2) })
  if (profile.legacy_liked_artists_count != null) rows.push({ label: '♥ atlikėjų', value: profile.legacy_liked_artists_count.toLocaleString('lt-LT') })
  if (profile.legacy_liked_albums_count != null) rows.push({ label: '♥ albumų', value: profile.legacy_liked_albums_count.toLocaleString('lt-LT') })
  if (profile.legacy_liked_tracks_count != null) rows.push({ label: '♥ dainų', value: profile.legacy_liked_tracks_count.toLocaleString('lt-LT') })

  const contentRows: { label: string; value: string }[] = []
  if (stats.daily_picks) contentRows.push({ label: 'Dienos dainos', value: stats.daily_picks.toLocaleString('lt-LT') })
  if (stats.diary) contentRows.push({ label: 'Dienoraščio įrašai', value: stats.diary.toLocaleString('lt-LT') })
  if (stats.translate) contentRows.push({ label: 'Vertimai', value: stats.translate.toLocaleString('lt-LT') })
  if (stats.creation) contentRows.push({ label: 'Kūryba', value: stats.creation.toLocaleString('lt-LT') })
  if (stats.comments_received) contentRows.push({ label: 'Komentarai', value: stats.comments_received.toLocaleString('lt-LT') })

  return (
        <>
          {/* Header */}
          {showHeader && (
          <div className="flex items-center gap-4 mb-6">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-14 h-14 rounded-xl object-cover"
                style={{ border: '1px solid var(--border-default)' }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black"
                   style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                {(profile.full_name || profile.username || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-black leading-tight"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {profile.username}
              </h2>
              {displayDifferent && (
                <p className="text-sm font-semibold mt-0.5"
                   style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                  {profile.full_name}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                 style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                <span>@{profile.username}</span>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <span>narys nuo {memberSinceYear}</span>
                {profile.legacy_city && (
                  <>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span>{profile.legacy_city}</span>
                  </>
                )}
                {isLegacy && isUnclaimed && (
                  <>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                      style={{
                        color: 'var(--text-muted)',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      archyvinis
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          )}

          <div className={wide ? 'lg:columns-2 lg:gap-8 [&>section]:break-inside-avoid [&>section]:mb-6' : ''}>
          {/* Member photos — legacy_profile_photos */}
          {photos.length > 0 && (
            <section className={secMb}>
              <SectionLabel>Nario nuotraukos</SectionLabel>
              <div className={compact ? 'mt-2 grid grid-cols-4 gap-1.5' : 'mt-2 grid grid-cols-3 sm:grid-cols-4 gap-2'}>
                {photos.slice(0, 8).map((p, i) => (
                  <a
                    key={i}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-square rounded-lg overflow-hidden transition hover:scale-[1.02]"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)' }}
                    title={p.caption || ''}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.thumb_url || p.url}
                      alt={p.caption || ''}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    {p.caption && (
                      <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[11px] text-white truncate"
                           style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)' }}>
                        {p.caption}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Personal info — V18f: kompaktiškos eilutės; V18j be „Užsiėmimas". */}
          {(profile.legacy_city || age != null) && (
            <section className={secMb}>
              <SectionLabel>Apie narį</SectionLabel>
              <div className="mt-2 flex flex-col">
                {([
                  ['Miestas', profile.legacy_city || null],
                  ['Amžius', age != null ? `${age} m.` : null],
                ].filter(([, v]) => v) as [string, string][]).map(([k, v], i) => (
                  <div key={k} className="flex items-baseline gap-3 py-1.5"
                       style={{ borderTop: i > 0 ? '1px dashed var(--border-subtle)' : 'none' }}>
                    <span className="flex-shrink-0 w-[92px] text-[11px] uppercase tracking-wider font-extrabold"
                          style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>{k}</span>
                    <span className="text-[14.5px] font-semibold"
                          style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>{v}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bio */}
          {profile.bio && (
            <section className={secMb}>
              <SectionLabel>
                Aprašymas
                {!hideLegacy && (
                  <span className="ml-2 italic font-normal" style={{ color: 'var(--text-faint)' }}>
                    (iš senos music.lt — gali būti pasenęs)
                  </span>
                )}
              </SectionLabel>
              <div
                className={`mt-2 rounded-xl leading-relaxed whitespace-pre-line ${compact ? 'p-3 text-[14px]' : 'p-4 text-sm'}`}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {profile.bio}
              </div>
              {sigClean && (
                <p className="mt-2 text-xs italic px-1"
                   style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                  „{sigClean}"
                </p>
              )}
            </section>
          )}

          {/* Mėgstamiausios knygos */}
          {profile.legacy_favorite_books && (
            <section className={secMb}>
              <SectionLabel>Mėgstamiausios knygos</SectionLabel>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                {profile.legacy_favorite_books}
              </p>
            </section>
          )}

          {/* Mėgstamiausi filmai (V18j) */}
          {profile.legacy_favorite_films && (
            <section className={secMb}>
              <SectionLabel>Mėgstamiausi filmai</SectionLabel>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                {profile.legacy_favorite_films}
              </p>
            </section>
          )}

          {/* Content stats */}
          {contentRows.length > 0 && (
            <section className={secMb}>
              <SectionLabel>Turinys music.lt</SectionLabel>
              <div className={statGrid}>
                {contentRows.map((r) => <StatBox key={r.label} {...r} compact={compact} />)}
              </div>
            </section>
          )}

          {/* Forum / legacy stats — slepiam kai hideLegacy (V18 inline „Apie mane") */}
          {!hideLegacy && rows.length > 0 && (
            <section>
              <SectionLabel>Statistika (legacy)</SectionLabel>
              <div className={statGrid}>
                {rows.map((r) => <StatBox key={r.label} {...r} compact={compact} />)}
              </div>
            </section>
          )}
          </div>
        </>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-extrabold uppercase tracking-[0.18em]"
      style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--accent-orange)' }}
    >
      {children}
    </div>
  )
}

function Pair({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div
      className="px-3 py-2 rounded-lg"
      style={{
        background: highlight ? 'rgba(251,191,36,0.10)' : 'var(--card-bg)',
        border: `1px solid ${highlight ? 'rgba(251,191,36,0.30)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="text-[11px] uppercase tracking-wider font-bold mb-0.5"
           style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        {k}
      </div>
      <div className="text-sm font-bold"
           style={{ color: highlight ? '#fbbf24' : 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
        {v}
      </div>
    </div>
  )
}

function StatBox({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div
      className={`${compact ? 'px-2 py-2' : 'px-3 py-3'} rounded-lg text-center`}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className={`${compact ? 'text-[15px] mb-0.5' : 'text-lg mb-1'} font-black leading-none`}
           style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
        {value}
      </div>
      <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} uppercase tracking-wider font-bold leading-tight`}
           style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        {label}
      </div>
    </div>
  )
}
