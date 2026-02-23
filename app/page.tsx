'use client'

import { useState, useEffect } from 'react'
import { HeaderAuth } from '@/components/HeaderAuth'
import Link from 'next/link'

// ── Mock Data ──────────────────────────────────────────────────────────────────

const HERO_FEATURE = {
  label: 'Šią savaitę kyla',
  credibility: 'Redakcija',
  artist: 'Silvester Belt',
  title: 'Bend The Lie',
  desc: 'Oficiali Lietuvos daina „Eurovision 2026" – jau viršuje Europoje.',
  gradient: 'from-indigo-900 via-purple-900 to-pink-900',
  accent: '#a78bfa',
  streams: '2.4M',
  weeks: 3,
}

const HERO_CARDS = [
  { label: 'Premjera', title: 'Skamp sugrįžta', sub: 'Pirmasis albumas per 15 metų', color: 'from-orange-900 to-red-900' },
  { label: 'Renginys', title: 'Granatas – Vilniaus arena', sub: 'Spalio 18 d. • Bilietai', color: 'from-emerald-900 to-teal-900' },
]

const SIANDIEN = [
  { type: 'release', label: 'Nauja daina', artist: 'Monika Liu', title: 'Sentimentai', genre: 'Pop', color: 'hsl(280,50%,25%)' },
  { type: 'event', label: 'Šiandien', artist: 'Kęstutis Antanėlis', title: 'Žalgirio Arena', sub: 'Kaunas', color: 'hsl(200,50%,20%)' },
  { type: 'community', label: 'Bendruomenė', artist: 'rokaslt', title: 'Mano top 10 LT albumų', sub: '47 komentarai', color: 'hsl(340,50%,20%)' },
]

const CHARTS_LT = [
  { pos: 1, prev: 1, artist: 'Monika Liu', title: 'Sentimentai', wks: 4, trend: 'same' },
  { pos: 2, prev: 4, artist: 'Silvester Belt', title: 'Bend The Lie', wks: 2, trend: 'up' },
  { pos: 3, prev: 2, artist: 'Jazzu', title: 'Kur Eisi', wks: 7, trend: 'down' },
  { pos: 4, prev: 6, artist: 'Galerija', title: 'Naktis', wks: 3, trend: 'up' },
  { pos: 5, prev: null, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', wks: 1, trend: 'new' },
  { pos: 6, prev: 5, artist: 'Andrius Mamontovas', title: 'Laikas', wks: 9, trend: 'down' },
  { pos: 7, prev: 8, artist: 'Jurga', title: 'Vasaros Naktys', wks: 5, trend: 'up' },
  { pos: 8, prev: 7, artist: 'Dainava', title: 'Tamsoje', wks: 2, trend: 'down' },
]

const CHARTS_INTL = [
  { pos: 1, prev: 2, artist: 'Rose & Bruno Mars', title: 'APT.', trend: 'up' },
  { pos: 2, prev: 1, artist: 'Lady Gaga', title: 'Disease', trend: 'down' },
  { pos: 3, prev: 3, artist: 'Sabrina Carpenter', title: 'Espresso', trend: 'same' },
  { pos: 4, prev: 5, artist: 'Billie Eilish', title: 'Birds of a Feather', trend: 'up' },
  { pos: 5, prev: 4, artist: 'Chappell Roan', title: 'Good Luck, Babe!', trend: 'down' },
  { pos: 6, prev: 7, artist: 'Kendrick Lamar', title: 'Luther', trend: 'up' },
  { pos: 7, prev: 6, artist: 'SZA', title: 'Saturn', trend: 'down' },
  { pos: 8, prev: null, artist: 'Gracie Abrams', title: 'That\'s So True', trend: 'new' },
]

const NEW_RELEASES = [
  { artist: 'Jurga', title: 'Vasaros Naktys', type: 'Albumas', tracks: 11, color: 'hsl(160,50%,20%)' },
  { artist: 'Galerija', title: 'Naktis', type: 'Albumas', tracks: 8, color: 'hsl(260,50%,22%)' },
  { artist: 'Dainava', title: 'Tamsoje', type: 'EP', tracks: 9, color: 'hsl(20,50%,20%)' },
  { artist: 'Saulės Kliošas', title: 'Rugsėjis EP', type: 'EP', tracks: 5, color: 'hsl(320,50%,20%)' },
  { artist: 'Inculto', title: 'Retro', type: 'Albumas', tracks: 13, color: 'hsl(40,50%,18%)' },
  { artist: 'Skamp', title: 'Sugrįžimas', type: 'Albumas', tracks: 12, color: 'hsl(200,60%,18%)' },
]

const EVENTS = [
  { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
  { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', venue: 'Tamsta Club', city: 'Vilnius', sold: false },
  { d: '01', m: 'KOV', title: 'Jurga & Orkestras', venue: 'LNFO', city: 'Vilnius', sold: false },
  { d: '15', m: 'KOV', title: 'Donatas Montvydas', venue: 'Compensa', city: 'Vilnius', sold: true },
  { d: '22', m: 'KOV', title: 'Andrius Mamontovas', venue: 'Forum Palace', city: 'Vilnius', sold: false },
]

const COMMUNITY = [
  { type: 'discussion', author: 'muzikoslt', title: 'Kaip vertinate naują Skamp albumą?', replies: 47, likes: 23, ago: '2 val.' },
  { type: 'blog', author: 'rockfanas', title: 'Mano top 10 LT albumų 2025 metais', replies: 12, likes: 56, ago: '5 val.' },
  { type: 'review', author: 'jazzlover', title: 'Jurga „Vasaros Naktys" – recenzija', replies: 8, likes: 34, ago: '1 d.' },
  { type: 'song', author: 'rokaslt', title: 'Foje – Žmogus Kuris Nemoka Šokti', votes: 47, ago: 'Dienos daina' },
]

const GENRES = ['Lietuviška estrada', 'Indie', 'Hip-hop', 'Elektronika', 'Rokas', 'Jazz / Soul', 'Folk / Etno', 'Klasika']
const CITIES = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys']

const DISCOVER_ARTISTS = [
  { name: 'Monika Liu', genre: 'Pop', color: 'hsl(280,55%,30%)', new: true },
  { name: 'Jazzu', genre: 'Soul', color: 'hsl(200,55%,25%)', new: false },
  { name: 'Dž. Džo', genre: 'Hip-hop', color: 'hsl(30,60%,25%)', new: true },
  { name: 'Galerija', genre: 'Elektronika', color: 'hsl(160,50%,22%)', new: false },
  { name: 'Saulės Kliošas', genre: 'Indie', color: 'hsl(340,55%,25%)', new: true },
  { name: 'Inculto', genre: 'Elektronika', color: 'hsl(60,50%,20%)', new: false },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="text-emerald-400 text-xs font-bold">↑</span>
  if (trend === 'down') return <span className="text-red-400 text-xs font-bold">↓</span>
  if (trend === 'new') return <span className="text-xs font-black text-amber-400">N</span>
  return <span className="text-gray-600 text-xs">─</span>
}

function Chip({ children, color = 'default' }: { children: React.ReactNode; color?: string }) {
  const cls: Record<string, string> = {
    default: 'bg-white/10 text-gray-300',
    orange: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    green: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    red: 'bg-red-500/20 text-red-300 border border-red-500/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls[color] || cls.default}`}>
      {children}
    </span>
  )
}

function SectionHeader({ children, action, actionHref = '#' }: { children: React.ReactNode; action?: string; actionHref?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-black text-white tracking-tight">{children}</h2>
      {action && (
        <a href={actionHref} className="text-sm text-gray-400 hover:text-white transition-colors font-medium">
          {action} →
        </a>
      )}
    </div>
  )
}

function ArtistAvatar({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-8 h-8 text-sm', md: 'w-12 h-12 text-base', lg: 'w-20 h-20 text-2xl' }[size]
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-black text-white/70 flex-shrink-0`} style={{ background: color }}>
      {name[0]}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [chartTab, setChartTab] = useState<'lt' | 'intl' | 'vote'>('lt')
  const [eventCity, setEventCity] = useState('Visi')
  const [votedIdx, setVotedIdx] = useState<number | null>(null)
  const [lensMode, setLensMode] = useState<'lt' | 'world' | 'mix'>('lt')

  const filteredEvents = eventCity === 'Visi' ? EVENTS : EVENTS.filter(e => e.city === eventCity)

  return (
    <div className="min-h-screen bg-[#0d0d0f] text-white">

      {/* ── TOP NAV ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0d0d0f]/90 backdrop-blur-xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
          <Link href="/" className="flex-shrink-0 font-black text-2xl tracking-tight">
            <span className="text-white">music</span><span className="text-orange-400">.lt</span>
          </Link>

          <div className="flex-1 max-w-xl hidden md:block">
            <div className="relative">
              <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
                className="w-full bg-white/5 border border-white/8 rounded-full px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/20 focus:bg-white/8 transition-all" />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm">⌕</span>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {/* Lens switch */}
            <div className="hidden sm:flex items-center bg-white/5 rounded-full p-0.5 mr-2">
              {(['lt', 'world', 'mix'] as const).map(mode => (
                <button key={mode} onClick={() => setLensMode(mode)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${lensMode === mode ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>
                  {mode === 'lt' ? '🇱🇹 LT' : mode === 'world' ? '🌍' : '⚡ Mix'}
                </button>
              ))}
            </div>
            <HeaderAuth />
          </div>
        </div>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────── */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Feature card */}
          <div className={`lg:col-span-2 relative rounded-2xl overflow-hidden bg-gradient-to-br ${HERO_FEATURE.gradient} p-6 sm:p-8 min-h-[280px] flex flex-col justify-between`}>
            <div className="absolute inset-0 opacity-20" style={{backgroundImage: 'radial-gradient(circle at 70% 50%, rgba(167,139,250,0.4) 0%, transparent 60%)'}} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <Chip color="purple">{HERO_FEATURE.credibility}</Chip>
                <Chip color="amber">{HERO_FEATURE.label}</Chip>
              </div>
              <p className="text-gray-300 text-sm mb-2">{HERO_FEATURE.artist}</p>
              <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-3">{HERO_FEATURE.title}</h1>
              <p className="text-gray-300 text-sm max-w-md leading-relaxed mb-6">{HERO_FEATURE.desc}</p>
              <div className="flex items-center gap-3 flex-wrap">
                <button className="bg-white text-black font-bold px-5 py-2.5 rounded-full text-sm hover:bg-gray-100 transition-colors">
                  Klausyti Spotify →
                </button>
                <button className="border border-white/20 text-white font-medium px-5 py-2.5 rounded-full text-sm hover:bg-white/10 transition-colors">
                  Atikėjo profilis
                </button>
              </div>
            </div>
            <div className="relative flex items-center gap-4 mt-6 pt-4 border-t border-white/10">
              <div className="text-center"><div className="text-xl font-black">{HERO_FEATURE.streams}</div><div className="text-xs text-gray-400">srautų</div></div>
              <div className="text-center"><div className="text-xl font-black">#{HERO_FEATURE.weeks}</div><div className="text-xs text-gray-400">savaitė TOP</div></div>
            </div>
          </div>

          {/* Side cards */}
          <div className="flex flex-col gap-4">
            {HERO_CARDS.map((c, i) => (
              <div key={i} className={`relative rounded-2xl overflow-hidden bg-gradient-to-br ${c.color} p-5 flex-1 flex flex-col justify-between cursor-pointer hover:scale-[1.01] transition-transform`}>
                <Chip color="orange">{c.label}</Chip>
                <div className="mt-4">
                  <h3 className="font-black text-lg leading-snug">{c.title}</h3>
                  <p className="text-sm text-gray-300 mt-1">{c.sub}</p>
                </div>
              </div>
            ))}
            {/* Artist CTA */}
            <div className="rounded-2xl border border-dashed border-white/15 p-5 flex flex-col items-center justify-center text-center gap-2 hover:border-white/30 transition-colors cursor-pointer group">
              <div className="text-2xl">🎤</div>
              <p className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">Aš atlikėjas (-a)</p>
              <p className="text-xs text-gray-500">Sukurk ar perimk profilį</p>
            </div>
          </div>
        </div>

        {/* Value prop */}
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-sm">Lietuvos muzikos bendruomenė nuo 1999 m. — <span className="text-white font-medium">atlikėjai, albumai, renginiai, topai ir daugiau.</span></p>
        </div>
      </section>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 space-y-14 pb-16">

        {/* ── 1. ŠIANDIEN LIETUVOJE ───────────────────────────────────── */}
        <section>
          <SectionHeader action="Visos naujienos">Šiandien Lietuvoje</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {SIANDIEN.map((item, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-white/8 hover:border-white/15 transition-all cursor-pointer group">
                <div className="h-32 flex items-center justify-center text-4xl font-black text-white/10" style={{ background: item.color }}>
                  {item.type === 'release' ? '♪' : item.type === 'event' ? '📅' : '💬'}
                </div>
                <div className="p-4">
                  <Chip color={item.type === 'release' ? 'blue' : item.type === 'event' ? 'green' : 'purple'}>
                    {item.label}
                  </Chip>
                  <h3 className="font-bold mt-2 group-hover:text-orange-400 transition-colors">{item.artist}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">{item.title}</p>
                  {item.sub && <p className="text-xs text-gray-500 mt-0.5">{item.sub}</p>}
                  <button className="mt-3 text-xs font-bold text-orange-400 hover:text-orange-300 transition-colors">
                    {item.type === 'release' ? 'Klausyti →' : item.type === 'event' ? 'Bilietai →' : 'Skaityti →'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. TOPAI ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader>Topai</SectionHeader>
          <div className="rounded-2xl border border-white/8 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-white/8">
              {[
                { key: 'lt', label: '🇱🇹 LT Top 30' },
                { key: 'intl', label: '🌍 Top 40' },
                { key: 'vote', label: '🗳️ Balsuoti' },
              ].map(tab => (
                <button key={tab.key} onClick={() => setChartTab(tab.key as any)}
                  className={`flex-1 py-3 text-sm font-bold transition-all ${chartTab === tab.key ? 'bg-white/5 text-white border-b-2 border-orange-400' : 'text-gray-500 hover:text-gray-300'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {chartTab !== 'vote' ? (
              <div className="divide-y divide-white/5">
                {(chartTab === 'lt' ? CHARTS_LT : CHARTS_INTL).map((track) => (
                  <div key={track.pos} className="flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors group cursor-pointer">
                    <span className={`w-6 text-center font-black text-sm flex-shrink-0 ${track.pos <= 3 ? 'text-orange-400' : 'text-gray-600'}`}>{track.pos}</span>
                    <TrendIcon trend={track.trend} />
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center font-black text-white/30 text-xs" style={{ background: `hsl(${track.pos * 37},40%,20%)` }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate group-hover:text-orange-400 transition-colors">{track.title}</div>
                      <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                    </div>
                    {('wks' in track) && (track as {wks?: number}).wks && <span className="text-[10px] text-gray-600 flex-shrink-0">{(track as {wks?: number}).wks} sav.</span>}
                    <button className="text-[10px] text-gray-500 hover:text-white border border-white/10 hover:border-white/30 px-2 py-1 rounded-full transition-all opacity-0 group-hover:opacity-100">
                      Klausyti
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-400 mb-2 text-sm">Balsuokite už savo mėgstamą dainą</p>
                <button className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-full transition-colors">
                  Prisijungti ir balsuoti
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── 3. NAUJA MUZIKA ─────────────────────────────────────────── */}
        <section>
          <SectionHeader action="Visa nauja muzika">Nauja muzika</SectionHeader>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {NEW_RELEASES.map((r, i) => (
              <div key={i} className="flex-shrink-0 w-[160px] group cursor-pointer">
                <div className="aspect-square rounded-xl mb-3 flex items-center justify-center text-4xl font-black text-white/10 relative overflow-hidden" style={{ background: r.color }}>
                  <span>♪</span>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <span className="text-white text-2xl opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-0.5">{r.artist}</p>
                <h4 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors leading-snug">{r.title}</h4>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Chip>{r.type}</Chip>
                  <span className="text-[10px] text-gray-600">{r.tracks} d.</span>
                </div>
                <button className="mt-2 text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors">Klausyti →</button>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. RENGINIAI ────────────────────────────────────────────── */}
        <section>
          <SectionHeader action="Visi renginiai">Renginiai</SectionHeader>
          {/* City filter */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {['Visi', ...CITIES].map(city => (
              <button key={city} onClick={() => setEventCity(city)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${eventCity === city ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
                {city}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-4 bg-white/4 hover:bg-white/7 border border-white/6 hover:border-white/12 rounded-2xl px-5 py-4 cursor-pointer group transition-all">
                <div className="text-center flex-shrink-0 w-10">
                  <div className="text-2xl font-black leading-none text-white">{e.d}</div>
                  <div className="text-[10px] font-black text-orange-400 uppercase">{e.m}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm truncate group-hover:text-orange-400 transition-colors">{e.title}</h4>
                  <p className="text-xs text-gray-400 truncate">{e.venue} · {e.city}</p>
                  {e.sold && <Chip color="red">Parduota</Chip>}
                </div>
                {!e.sold && <button className="text-xs font-bold text-orange-400 flex-shrink-0">Bilietai →</button>}
              </div>
            ))}
          </div>
        </section>

        {/* ── 5. BENDRUOMENĖ ──────────────────────────────────────────── */}
        <section>
          <SectionHeader action="Visos diskusijos">Bendruomenė</SectionHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Posts */}
            <div className="lg:col-span-2 space-y-3">
              {COMMUNITY.filter(c => c.type !== 'song').map((c, i) => (
                <div key={i} className="flex gap-4 bg-white/4 hover:bg-white/7 border border-white/6 rounded-2xl p-4 cursor-pointer group transition-all">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white/60 flex-shrink-0 text-sm" style={{ background: `hsl(${c.author.charCodeAt(0) * 17 % 360},40%,25%)` }}>
                    {c.author[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip color={c.type === 'discussion' ? 'blue' : c.type === 'blog' ? 'purple' : 'green'}>
                        {c.type === 'discussion' ? 'Diskusija' : c.type === 'blog' ? 'Blogas' : 'Recenzija'}
                      </Chip>
                      <span className="text-xs text-gray-500">{c.ago}</span>
                    </div>
                    <h4 className="font-bold text-sm group-hover:text-orange-400 transition-colors">{c.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="text-gray-400 font-medium">{c.author}</span>
                      {' · '}{c.replies} ats. · {c.likes} ❤
                    </p>
                  </div>
                </div>
              ))}
              <button className="w-full py-3 border border-dashed border-white/10 rounded-2xl text-sm text-gray-500 hover:text-white hover:border-white/20 transition-all font-medium">
                + Pradėti diskusiją
              </button>
            </div>

            {/* Dienos daina */}
            <div>
              <div className="bg-gradient-to-br from-orange-950 to-amber-950 border border-orange-500/20 rounded-2xl p-5">
                <Chip color="amber">🎵 Dienos daina</Chip>
                <div className="mt-4 flex gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-xl">♪</div>
                  <div>
                    <p className="text-xs text-gray-400">siūlo <span className="text-orange-400 font-bold">rokaslt</span></p>
                    <h4 className="font-black text-sm mt-0.5">Foje</h4>
                    <p className="text-xs text-gray-300">Žmogus Kuris Nemoka Šokti</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                  <span>🏆 47 balsai</span>
                  <button className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-4 py-1.5 rounded-full transition-colors text-xs">Balsuoti</button>
                </div>
                <p className="text-[10px] text-gray-600 mt-3">Vakar: Monika Liu — Sentimentai (89)</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. ATRASK ───────────────────────────────────────────────── */}
        <section>
          <SectionHeader action="Visi atlikėjai">Atrask</SectionHeader>

          {/* Genre chips */}
          <div className="flex gap-2 flex-wrap mb-6">
            {GENRES.map(g => (
              <button key={g} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/15 text-gray-300 hover:text-white rounded-full text-xs font-medium transition-all">
                {g}
              </button>
            ))}
          </div>

          {/* Artists */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4 mb-8">
            {DISCOVER_ARTISTS.map((a, i) => (
              <div key={i} className="group cursor-pointer text-center relative">
                {a.new && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-[9px] font-black rounded-full flex items-center justify-center z-10">N</span>
                )}
                <div className="aspect-square rounded-full mb-2 flex items-center justify-center font-black text-white/50 text-2xl mx-auto group-hover:scale-105 transition-transform" style={{ background: a.color }}>
                  {a.name[0]}
                </div>
                <p className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors truncate">{a.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{a.genre}</p>
              </div>
            ))}
          </div>

          {/* City/Scene entry points */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {CITIES.map((city, i) => (
              <button key={city} className="group bg-white/4 hover:bg-white/8 border border-white/6 hover:border-white/15 rounded-xl p-4 text-center transition-all">
                <div className="text-2xl mb-1">{'🏙️🎪🌊🎵🌿'[i]}</div>
                <p className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">{city}</p>
                <p className="text-[10px] text-gray-500">scena</p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#080809]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="font-black text-xl mb-3"><span className="text-white">music</span><span className="text-orange-400">.lt</span></div>
              <p className="text-sm text-gray-600">Lietuvos muzikos bendruomenė nuo 1999 m.</p>
            </div>
            {[
              { t: 'Naršyti', l: ['Naujienos', 'Atlikėjai', 'Albumai', 'Renginiai', 'Topai'] },
              { t: 'Bendruomenė', l: ['Diskusijos', 'Blogai', 'Recenzijos', 'Pokalbiai'] },
              { t: 'Apie', l: ['Apie mus', 'Reklama', 'Kontaktai', 'Privatumas'] },
            ].map(col => (
              <div key={col.t}>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-600 mb-3">{col.t}</h4>
                <ul className="space-y-2">
                  {col.l.map(l => <li key={l}><a href="#" className="text-sm text-gray-600 hover:text-white transition-colors">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-xs text-gray-700">© 2026 Music.lt — Visos teisės saugomos</span>
            <div className="flex gap-4">
              {['Facebook', 'Instagram', 'YouTube', 'Spotify'].map(s => (
                <a key={s} href="#" className="text-xs text-gray-700 hover:text-white transition-colors">{s}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
