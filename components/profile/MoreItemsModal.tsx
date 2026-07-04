'use client'

// components/profile/MoreItemsModal.tsx
//
// V11 — generinis „+N daugiau" modal'as artist/album/track sąrašams su
// quick filter chips, kurie skirtingi pagal kind:
//   - artist: 'Pagal afinitetą' / 'Naujausi pamėgti' / 'A–Z'
//   - album:  'Pagal pamėgtų dainų' / 'Naujausi pamėgti' / 'A–Z'
//   - track:  'Naujausi pamėgti' / 'Pagal populiarumą' / 'A–Z'
//
// Track tile naudoja YT thumbnail'ą (extracted iš tracks.video_url'o),
// fallback į cover_url. Albums tile rodo „N pamėgtų dainų" badge.

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

type Kind = 'artist' | 'album' | 'track'
type SortMode = 'affinity' | 'recent' | 'alpha' | 'popular' | 'liked_tracks'

const YT_REGEX = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/

function ytThumb(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null
  const m = videoUrl.match(YT_REGEX)
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
}

const SORT_OPTIONS: Record<Kind, { mode: SortMode; label: string }[]> = {
  artist: [
    { mode: 'affinity', label: 'Pagal afinitetą' },
    { mode: 'recent', label: 'Naujausi' },
    { mode: 'alpha', label: 'A–Z' },
  ],
  album: [
    { mode: 'liked_tracks', label: 'Pagal pamėgtų dainų' },
    { mode: 'recent', label: 'Naujausi pamėgti' },
    { mode: 'alpha', label: 'A–Z' },
  ],
  track: [
    { mode: 'recent', label: 'Naujausi pamėgti' },
    { mode: 'popular', label: 'Pagal populiarumą' },
    { mode: 'alpha', label: 'A–Z' },
  ],
}

export function MoreItemsModal({
  kind, title, items, onClose, username,
}: {
  kind: Kind
  title: string
  items: any[]
  onClose: () => void
  // V18d: kai duotas — album/track modalas pasiima VISUS pamėgtus per API
  // (SSR atsiunčia tik 48 preview).
  username?: string
}) {
  const [q, setQ] = useState('')
  const initialSort: SortMode =
    kind === 'artist' ? 'affinity'
    : kind === 'album' ? 'liked_tracks'
    : 'recent'
  const [sortMode, setSortMode] = useState<SortMode>(initialSort)
  const [allItems, setAllItems] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  // V18d: atidarius — pasiimam pilną sąrašą (tik album/track; artist jau pilnas).
  useEffect(() => {
    if (!username || (kind !== 'album' && kind !== 'track')) return
    let alive = true
    setLoading(true)
    fetch(`/api/profile/${encodeURIComponent(username)}/likes?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => { if (alive && Array.isArray(d.items) && d.items.length) setAllItems(d.items) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [username, kind])

  const sourceItems = allItems || items

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    let rows = sourceItems
    if (ql) {
      rows = rows.filter((it: any) => {
        const t = (kind === 'artist' ? it.name : it.title) || ''
        const ar = kind !== 'artist'
          ? (Array.isArray(it.artists) ? it.artists[0]?.name : it.artists?.name) || ''
          : ''
        return t.toLowerCase().includes(ql) || ar.toLowerCase().includes(ql)
      })
    }
    rows = [...rows]
    if (sortMode === 'alpha') {
      rows.sort((a: any, b: any) => {
        const an = (kind === 'artist' ? a.name : a.title) || ''
        const bn = (kind === 'artist' ? b.name : b.title) || ''
        return an.localeCompare(bn, 'lt')
      })
    } else if (sortMode === 'affinity' && kind === 'artist') {
      rows.sort((a: any, b: any) => (b.affinity_score || 0) - (a.affinity_score || 0))
    } else if (sortMode === 'liked_tracks' && kind === 'album') {
      rows.sort((a: any, b: any) => (b.liked_track_count || 0) - (a.liked_track_count || 0))
    } else if (sortMode === 'popular' && kind === 'track') {
      rows.sort((a: any, b: any) => (b.like_count || 0) - (a.like_count || 0))
    } else if (sortMode === 'recent') {
      rows.sort((a: any, b: any) => {
        const ad = new Date(a.liked_at || a.created_at || 0).getTime()
        const bd = new Date(b.liked_at || b.created_at || 0).getTime()
        return bd - ad
      })
    }
    return rows
  }, [sourceItems, q, sortMode, kind])

  if (typeof window === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 backdrop-blur-md"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid var(--modal-border)',
          boxShadow: 'var(--modal-shadow)',
        }}
      >
        <header className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 className="font-black text-base sm:text-lg leading-tight"
              style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
            {title} <span className="font-bold" style={{ color: 'var(--text-muted)' }}>· {sourceItems.length}</span>
            {loading && <span className="ml-2 text-[12px] font-bold align-middle" style={{ color: 'var(--text-faint)' }}>kraunama…</span>}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition hover:opacity-80"
            style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}
            aria-label="Uždaryti"
          >
            <span style={{ color: 'var(--text-secondary)' }}>✕</span>
          </button>
        </header>

        <div className="px-5 sm:px-6 py-3 flex flex-wrap items-center gap-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            type="text"
            placeholder="Ieškoti pavadinimą…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-2 rounded-lg text-sm"
            style={{
              fontFamily: "'Outfit', sans-serif",
              background: 'var(--card-bg)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex gap-1 rounded-lg p-1 flex-wrap" style={{ background: 'var(--card-bg)', border: '1px solid var(--border-default)' }}>
            {SORT_OPTIONS[kind].map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setSortMode(opt.mode)}
                className="px-2.5 py-1 rounded text-[12px] font-extrabold uppercase tracking-wider transition"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  background: sortMode === opt.mode ? 'var(--accent-orange)' : 'transparent',
                  color: sortMode === opt.mode ? '#000' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {filtered.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
              Nieko nerasta pagal jūsų užklausą.
            </p>
          ) : kind === 'artist' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {filtered.map((a: any) => (
                <Link
                  key={a.id}
                  href={`/atlikejai/${a.slug}`}
                  className="group relative aspect-square rounded-xl overflow-hidden"
                  style={{ background: 'var(--card-bg)' }}
                  onClick={onClose}
                >
                  {a.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#1a2436] to-[#080c12] flex items-center justify-center text-2xl font-black"
                         style={{ fontFamily: "'Outfit', sans-serif", color: 'rgba(255,255,255,0.15)' }}>
                      {a.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                  {(a.affinity_score || 0) > 0 && (
                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold backdrop-blur-md"
                         style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.92)' }}>
                      ♥ {a.affinity_score}
                    </div>
                  )}
                  <p className="absolute bottom-0 left-0 right-0 p-2 text-xs font-extrabold text-white leading-tight truncate"
                     style={{ fontFamily: "'Outfit', sans-serif" }}>
                    {a.name}
                  </p>
                </Link>
              ))}
            </div>
          ) : kind === 'album' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {filtered.map((al: any) => {
                const artist = Array.isArray(al.artists) ? al.artists[0] : al.artists
                const href = artist ? `/atlikejai/${artist.slug}/${al.slug || al.id}` : `/lt/albumas/${al.slug || ''}/${al.id}`
                const lc = al.liked_track_count || 0
                return (
                  <Link key={al.id} href={href} onClick={onClose}
                        className="group block rounded-xl overflow-hidden transition hover:scale-[1.03]"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', contentVisibility: 'auto', containIntrinsicSize: '0 200px' }}>
                    <div className="relative aspect-square w-full overflow-hidden"
                         style={{ background: 'linear-gradient(135deg, var(--border-subtle), var(--card-bg))' }}>
                      {al.cover_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={al.cover_url} alt={al.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : null}
                      {lc > 0 && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold backdrop-blur-md"
                             style={{ background: 'rgba(0,0,0,0.55)', color: '#fbbf24' }}>
                          ♥ {lc} d.
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-[11px] uppercase tracking-wider truncate"
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
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {filtered.map((t: any, i: number) => {
                const artist = Array.isArray(t.artists) ? t.artists[0] : t.artists
                const href = artist ? `/atlikejai/${artist.slug}/${t.slug || t.id}` : `/lt/daina/${t.slug || ''}/${t.id}`
                const thumb = ytThumb(t.video_url) || t.cover_url || artist?.cover_image_url || null
                return (
                  <Link key={t.id} href={href} onClick={onClose}
                        className="group flex items-center gap-2.5 rounded-lg p-2 transition hover:bg-[var(--hover-bg)]"
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}>
                    <div className="w-5 text-center text-[12px] font-bold tabular-nums flex-shrink-0"
                         style={{ color: 'var(--text-faint)', fontFamily: "'Outfit', sans-serif" }}>
                      {i + 1}
                    </div>
                    <div className="w-14 h-10 rounded overflow-hidden flex-shrink-0"
                         style={{ background: 'var(--border-subtle)' }}>
                      {thumb ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumb} alt={t.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-tight truncate"
                           style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-primary)' }}>
                        {t.title}
                      </div>
                      <div className="text-[12px] truncate"
                           style={{ fontFamily: "'Outfit', sans-serif", color: 'var(--text-muted)' }}>
                        {artist?.name || '—'}
                      </div>
                    </div>
                    {t.like_count > 0 && (
                      <div className="text-[11px] font-bold flex-shrink-0 pr-1"
                           style={{ color: 'var(--text-muted)', fontFamily: "'Outfit', sans-serif" }}>
                        ♥ {t.like_count}
                      </div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
