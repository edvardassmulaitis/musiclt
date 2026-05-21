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

  const sigClean = profile.legacy_signature?.replace(/^["„]|["""]$/g, '') ?? ''
  const birth = profile.legacy_birth_date ? new Date(profile.legacy_birth_date) : null
  const age = birth
    ? Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null

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
          {/* Header */}
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
            <div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight"
                  style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                {profile.full_name || profile.username}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                @{profile.username} · narys nuo {memberSinceYear}
              </p>
            </div>
          </div>

          {/* Personal info */}
          {(profile.legacy_city || age != null || profile.legacy_occupation) && (
            <section className="mb-5">
              <SectionLabel>Apie narį</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
                {profile.legacy_city && <Pair k="Miestas" v={profile.legacy_city} />}
                {age != null && <Pair k="Amžius" v={`${age} m.`} />}
                {profile.legacy_occupation && <Pair k="Užsiėmimas" v={profile.legacy_occupation} />}
                {profile.is_vip_legacy && <Pair k="Statusas" v="VIP narys" highlight />}
              </div>
            </section>
          )}

          {/* Bio */}
          {profile.bio && (
            <section className="mb-5">
              <SectionLabel>
                Aprašymas
                <span className="ml-2 italic font-normal" style={{ color: 'var(--text-faint)' }}>
                  (iš senos music.lt — gali būti pasenęs)
                </span>
              </SectionLabel>
              <div
                className="mt-2 p-4 rounded-xl text-sm leading-relaxed whitespace-pre-line"
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

          {/* Mėgstamos knygos / muzika (legacy_favorite_books field) */}
          {profile.legacy_favorite_books && (
            <section className="mb-5">
              <SectionLabel>Mėgstamiausios knygos</SectionLabel>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)', fontFamily: "'Outfit', sans-serif" }}>
                {profile.legacy_favorite_books}
              </p>
            </section>
          )}

          {/* Content stats */}
          {contentRows.length > 0 && (
            <section className="mb-5">
              <SectionLabel>Turinys music.lt</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
                {contentRows.map((r) => <StatBox key={r.label} {...r} />)}
              </div>
            </section>
          )}

          {/* Forum / legacy stats */}
          {rows.length > 0 && (
            <section>
              <SectionLabel>Statistika (legacy)</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-2">
                {rows.map((r) => <StatBox key={r.label} {...r} />)}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] font-extrabold uppercase tracking-[0.18em]"
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
      <div className="text-[10px] uppercase tracking-wider font-bold mb-0.5"
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

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-3 rounded-lg text-center"
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="text-lg font-black leading-none mb-1"
           style={{ color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider font-bold"
           style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
        {label}
      </div>
    </div>
  )
}
