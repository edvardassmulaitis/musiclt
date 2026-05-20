'use client'

// components/profile/ProfileFeaturedSlot.tsx
//
// Featured slot dešinėje hero pusėje — switchable tabs su trim opcijom:
//   1. Muzikometras — equalizer-style bar chart of broad style proportions
//   2. Nuotaikos daina — YT/visual track card su atlikėjo backdrop'u
//   3. Mėgstami atlikėjai — top 5 grid'as
//
// Defaultas: Muzikometras (jei yra data), kitaip Mood, kitaip atlikėjai.
// State'as kliento side'e, kad user'is gali perjungti — kaip atlikėjo page'e
// player'is.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type MeterEntry = {
  slug: string
  name: string
  legacy_id: number
  percent?: number
  width_px?: number
}

type MoodTrack = {
  id: number
  slug: string
  title: string
  artists?: any
} | null

type Artist = {
  id: number
  slug: string
  name: string
  cover_image_url?: string | null
}

type Props = {
  musicMeter: MeterEntry[] | null
  moodTrack: MoodTrack
  favoriteArtists: Artist[]
}

type Tab = 'meter' | 'mood' | 'artists'

export function ProfileFeaturedSlot({ musicMeter, moodTrack, favoriteArtists }: Props) {
  // Pick default tab — meter is most visually impressive
  const initial: Tab = musicMeter && musicMeter.length > 0
    ? 'meter'
    : moodTrack
    ? 'mood'
    : 'artists'
  const [tab, setTab] = useState<Tab>(initial)

  // Mounted check (avoid SSR/CSR mismatch for canvas)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const hasAny = (musicMeter && musicMeter.length > 0) || moodTrack || favoriteArtists.length > 0
  if (!hasAny) return null

  return (
    <div className="lg:self-end">
      <div className="rounded-2xl bg-white/[.03] backdrop-blur-md border border-white/[.08] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        {/* Tabs */}
        <div className="flex border-b border-white/[.05]">
          {musicMeter && musicMeter.length > 0 && (
            <TabButton active={tab === 'meter'} onClick={() => setTab('meter')}>
              Muzikometras
            </TabButton>
          )}
          {moodTrack && (
            <TabButton active={tab === 'mood'} onClick={() => setTab('mood')}>
              Nuotaikos daina
            </TabButton>
          )}
          {favoriteArtists.length > 0 && (
            <TabButton active={tab === 'artists'} onClick={() => setTab('artists')}>
              Mėgstami atlikėjai
            </TabButton>
          )}
        </div>

        {/* Content */}
        <div className="p-5 min-h-[280px]">
          {tab === 'meter' && musicMeter && mounted && <MusicMeterEqualizer meter={musicMeter} />}
          {tab === 'mood' && moodTrack && <MoodSongCard track={moodTrack} />}
          {tab === 'artists' && favoriteArtists.length > 0 && <FavoriteArtistsList artists={favoriteArtists} />}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab button
// ─────────────────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-3 text-[11px] uppercase tracking-wider font-bold transition relative ${
        active ? 'text-white' : 'text-[#5e7290] hover:text-[#b0bdd4]'
      }`}
      style={{ fontFamily: "'Outfit', sans-serif" }}
    >
      {children}
      {active && (
        <div className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#f97316] rounded-full" />
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Music meter equalizer
// ─────────────────────────────────────────────────────────────────────────────

function MusicMeterEqualizer({ meter }: { meter: MeterEntry[] }) {
  // Sort by percent descending
  const sorted = [...meter].sort((a, b) => (b.percent || b.width_px || 0) - (a.percent || a.width_px || 0))
  const maxPercent = Math.max(...sorted.map((s) => s.percent || 0))

  const palette: Record<string, { from: string; to: string }> = {
    'Rokas':        { from: '#f97316', to: '#dc2626' },
    'Sunkioji':     { from: '#dc2626', to: '#991b1b' },
    'Alternatyva':  { from: '#a78bfa', to: '#7c3aed' },
    'Pop, R&B':     { from: '#f472b6', to: '#db2777' },
    'Pop-RB':       { from: '#f472b6', to: '#db2777' },
    'Rimtoji':      { from: '#60a5fa', to: '#2563eb' },
    'Elektronika':  { from: '#34d399', to: '#059669' },
    'Hip-hop':      { from: '#fbbf24', to: '#d97706' },
    'Kita':         { from: '#94a3b8', to: '#475569' },
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-1 h-[180px] mb-3 px-1">
        {sorted.map((s, i) => {
          const pct = s.percent ?? 0
          const heightRel = maxPercent > 0 ? (pct / maxPercent) * 100 : 0
          const colors = palette[s.name] || { from: '#5e7290', to: '#334058' }
          return (
            <div key={s.legacy_id} className="flex flex-col items-center flex-1 min-w-0 group">
              {/* Bar */}
              <div className="w-full flex flex-col justify-end h-full relative">
                <div
                  className="w-full rounded-t-md transition-all duration-700 ease-out relative overflow-hidden"
                  style={{
                    height: `${Math.max(heightRel, 2)}%`,
                    background: `linear-gradient(to top, ${colors.from}, ${colors.to})`,
                    boxShadow: `0 0 24px ${colors.from}33`,
                    animationDelay: `${i * 80}ms`,
                  }}
                >
                  {/* Top highlight */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-white/30 rounded-t-md" />
                  {/* Faux equalizer segments — divider lines */}
                  <div className="absolute inset-0 flex flex-col-reverse">
                    {Array.from({ length: Math.floor(heightRel / 8) }).map((_, j) => (
                      <div key={j} className="h-[8px] border-b border-black/30" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Labels (rotated 45° to fit) */}
      <div className="flex justify-between gap-1 px-1 mb-3">
        {sorted.map((s) => (
          <div key={s.legacy_id} className="flex-1 min-w-0 text-center">
            <div className="text-[9px] font-bold text-[#dde8f8] truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>{s.name}</div>
            <div className="text-[10px] text-[#5e7290] font-mono">{(s.percent || 0).toFixed(0)}%</div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[#5e7290] text-center mt-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
        Klausymo profilio pasiskirstymas
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mood song card
// ─────────────────────────────────────────────────────────────────────────────

function MoodSongCard({ track }: { track: MoodTrack }) {
  if (!track) return null
  const artist = Array.isArray((track as any).artists) ? (track as any).artists[0] : (track as any).artists

  return (
    <div className="flex flex-col items-center text-center py-4">
      <div className="relative mb-4">
        {artist?.cover_image_url ? (
          <img
            src={artist.cover_image_url}
            alt=""
            className="w-32 h-32 rounded-2xl object-cover shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          />
        ) : (
          <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-orange-500/30 to-rose-600/30 flex items-center justify-center text-5xl">♫</div>
        )}
        {/* Vinyl ring effect */}
        <div className="absolute -inset-1 rounded-2xl border-2 border-orange-500/30 animate-pulse pointer-events-none" />
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-orange-400 font-bold mb-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
        ♬ Šio nario nuotaikos daina
      </div>
      <Link href={artist ? `/atlikejai/${artist.slug}` : '#'} className="group">
        <h3 className="text-lg font-extrabold text-white leading-tight group-hover:text-orange-400 transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {track.title}
        </h3>
        <p className="text-sm text-[#b0bdd4] mt-1" style={{ fontFamily: "'Outfit', sans-serif" }}>
          {artist?.name || 'Nežinomas atlikėjas'}
        </p>
      </Link>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Favorite artists list (top 5)
// ─────────────────────────────────────────────────────────────────────────────

function FavoriteArtistsList({ artists }: { artists: Artist[] }) {
  return (
    <div className="space-y-2">
      {artists.map((a, i) => (
        <Link
          key={a.id}
          href={`/atlikejai/${a.slug}`}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/[.04] transition group"
        >
          <div className="text-2xl font-black text-[#334058] w-7 text-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {i + 1}
          </div>
          {a.cover_image_url ? (
            <img src={a.cover_image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-[#111822] flex items-center justify-center text-lg text-[#334058]">
              {a.name[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate group-hover:text-[#f97316] transition" style={{ fontFamily: "'Outfit', sans-serif" }}>
              {a.name}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
