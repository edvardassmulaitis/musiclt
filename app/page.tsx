'use client'

import { useState } from 'react'
import { HeaderAuth } from '@/components/HeaderAuth'
import Link from 'next/link'

// ── Mock Data ──────────────────────────────────────────────────────────────────

const WEEK_SUMMARY = {
  song: { pos: 1, artist: 'Silvester Belt', title: 'Bend The Lie', wks: 3, streams: '2.4M' },
  album: { artist: 'Jurga', title: 'Vasaros Naktys', released: 'Šią savaitę' },
  newReleases: 14,
  events: [
    { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', city: 'Kaunas' },
    { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', city: 'Vilnius' },
  ],
}

const CHARTS_LT = [
  { pos: 1, prev: 1, artist: 'Monika Liu', title: 'Sentimentai', wks: 4, lt: true, trend: 'same' },
  { pos: 2, prev: 4, artist: 'Silvester Belt', title: 'Bend The Lie', wks: 2, lt: true, trend: 'up' },
  { pos: 3, prev: 2, artist: 'Jazzu', title: 'Kur Eisi', wks: 7, lt: true, trend: 'down' },
  { pos: 4, prev: 6, artist: 'Galerija', title: 'Naktis', wks: 3, lt: true, trend: 'up' },
  { pos: 5, prev: null, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', wks: 1, lt: true, trend: 'new' },
  { pos: 6, prev: 5, artist: 'Andrius Mamontovas', title: 'Laikas', wks: 9, lt: true, trend: 'down' },
  { pos: 7, prev: 8, artist: 'Jurga', title: 'Vasaros Naktys', wks: 5, lt: true, trend: 'up' },
  { pos: 8, prev: 7, artist: 'Dainava', title: 'Tamsoje', wks: 2, lt: true, trend: 'down' },
  { pos: 9, prev: 10, artist: 'Saulės Kliošas', title: 'Rugsėjis', wks: 6, lt: true, trend: 'up' },
  { pos: 10, prev: 9, artist: 'Inculto', title: 'Retro', wks: 4, lt: true, trend: 'down' },
]

const CHARTS_COMMUNITY = [
  { pos: 1, prev: 2, artist: 'Foje', title: 'Žmogus Kuris Nemoka Šokti', votes: 312, lt: true, trend: 'up' },
  { pos: 2, prev: 1, artist: 'Monika Liu', title: 'Sentimentai', votes: 287, lt: true, trend: 'down' },
  { pos: 3, prev: 3, artist: 'Andrius Mamontovas', title: 'Laikas', votes: 241, lt: true, trend: 'same' },
  { pos: 4, prev: 6, artist: 'Galerija', title: 'Naktis', votes: 198, lt: true, trend: 'up' },
  { pos: 5, prev: 4, artist: 'Jazzu', title: 'Kur Eisi', votes: 176, lt: true, trend: 'down' },
  { pos: 6, prev: 7, artist: 'Jurga', title: 'Vasaros Naktys', votes: 154, lt: true, trend: 'up' },
  { pos: 7, prev: 5, artist: 'Skamp', title: 'Come Back To Me', votes: 143, lt: true, trend: 'down' },
  { pos: 8, prev: null, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', votes: 121, lt: true, trend: 'new' },
  { pos: 9, prev: 8, artist: 'Saulės Kliošas', title: 'Rugsėjis', votes: 98, lt: true, trend: 'down' },
  { pos: 10, prev: 10, artist: 'Dainava', title: 'Tamsoje', votes: 87, lt: true, trend: 'same' },
]

const NEW_MUSIC = [
  { type: 'Singl', artist: 'Monika Liu', title: 'Palauk', lt: true, color: 'hsl(280,45%,22%)' },
  { type: 'Albumas', artist: 'Jurga', title: 'Vasaros Naktys', lt: true, color: 'hsl(160,45%,18%)' },
  { type: 'EP', artist: 'Saulės Kliošas', title: 'Rugsėjis', lt: true, color: 'hsl(320,45%,20%)' },
  { type: 'Singl', artist: 'Silvester Belt', title: 'Bend The Lie', lt: true, color: 'hsl(220,50%,22%)' },
  { type: 'Albumas', artist: 'Galerija', title: 'Naktis', lt: true, color: 'hsl(40,45%,18%)' },
  { type: 'Singl', artist: 'Dž. Džo', title: 'Vilniaus Vakaras', lt: true, color: 'hsl(200,50%,20%)' },
  { type: 'EP', artist: 'Dainava', title: 'Tamsoje', lt: false, color: 'hsl(260,45%,22%)' },
  { type: 'Albumas', artist: 'Inculto', title: 'Retro', lt: true, color: 'hsl(0,45%,20%)' },
]

const SOTD = {
  artist: 'Foje',
  title: 'Žmogus Kuris Nemoka Šokti',
  by: 'rokaslt',
  votes: 47,
  reactions: { fire: 124, heart: 89, star: 56 },
  yesterday: { artist: 'Monika Liu', title: 'Sentimentai', votes: 89 },
  candidates: [
    { artist: 'Monika Liu', title: 'Sentimentai', by: 'disk0', votes: 31 },
    { artist: 'Andrius Mamontovas', title: 'Laikas', by: 'metal_lt', votes: 28 },
    { artist: 'Jazzu', title: 'Kur Eisi', by: 'jazzfan', votes: 19 },
  ],
}

const EVENTS = [
  { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
  { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', venue: 'Tamsta Club', city: 'Vilnius', sold: false },
  { d: '01', m: 'KOV', title: 'Jurga & Orkestras', venue: 'LNFO', city: 'Vilnius', sold: false },
  { d: '15', m: 'KOV', title: 'Donatas Montvydas', venue: 'Compensa', city: 'Vilnius', sold: true },
  { d: '22', m: 'KOV', title: 'Andrius Mamontovas', venue: 'Forum Palace', city: 'Vilnius', sold: false },
  { d: '05', m: 'BAL', title: 'Skamp', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
]

const PRESS = [
  { artist: 'Silvester Belt', label: 'Oficialus pranešimas', title: 'Oficiali Lietuvos daina „Eurovision 2026" pristatyta Bazelyje', ago: '2 val.', ai: true },
  { artist: 'Skamp', label: 'Atlikėjo pranešimas', title: 'Skamp anunsavo pirmąjį albumą per 15 metų – „Sugrįžimas" gegužę', ago: '5 val.', ai: false },
  { artist: 'Granatas', label: 'Renginys', title: 'Granatas paskelbė Vilniaus arenos koncertą spalio 18 d.', ago: '1 d.', ai: true },
  { artist: 'Andrius Mamontovas', label: 'Interviu', title: 'Mamontovas: „Muzika visada randa kelią – net tyliausiuose namuose"', ago: '2 d.', ai: false },
]

const SHOUTBOX = [
  { user: 'muzikoslt', msg: 'Kas žino kada bus kitas Skamp koncertas?', ago: '2 min.' },
  { user: 'rockfanas', msg: 'Mamontovas 🔥🔥🔥 legendinis', ago: '5 min.' },
  { user: 'jazzlover', msg: 'Ieškau bilieto į Jurgą 03-01, kas parduoda?', ago: '12 min.' },
  { user: 'indie_lt', msg: 'Saulės Kliošo naujas EP yra fire', ago: '18 min.' },
  { user: 'vertejas', msg: 'Padėkite išverst Arctic Monkeys dainą!', ago: '23 min.' },
]

const CITIES = ['Visi', 'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai']
const MUSIC_FILTERS = ['Visi', 'Tik LT', 'Singlai', 'Albumai', 'EP']

// ── Helpers ────────────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'up') return <span className="text-emerald-400 text-xs font-bold w-4 text-center">↑</span>
  if (trend === 'down') return <span className="text-red-400 text-xs font-bold w-4 text-center">↓</span>
  if (trend === 'new') return <span className="text-[10px] font-black text-amber-400 w-4 text-center">N</span>
  return <span className="text-gray-700 text-xs w-4 text-center">─</span>
}

function FlagLT({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="text-[10px]" title="Lietuvos atlikėjas">🇱🇹</span>
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: string }) {
  const v: Record<string, string> = {
    default: 'bg-white/8 text-gray-400',
    blue: 'bg-blue-500/15 text-blue-300 border border-blue-500/20',
    orange: 'bg-orange-500/15 text-orange-300 border border-orange-500/20',
    green: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
    red: 'bg-red-500/15 text-red-300 border border-red-500/20',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/20',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${v[variant] || v.default}`}>
      {children}
    </span>
  )
}

function SectionHead({ children, cta, ctaHref = '#' }: { children: React.ReactNode; cta?: string; ctaHref?: string }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-lg font-black text-white tracking-tight">{children}</h2>
      {cta && <a href={ctaHref} className="text-sm text-gray-500 hover:text-white transition-colors">{cta} →</a>}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Home() {
  const [chartTab, setChartTab] = useState<'official' | 'community'>('official')
  const [musicFilter, setMusicFilter] = useState('Visi')
  const [eventCity, setEventCity] = useState('Visi')
  const [votedCandidate, setVotedCandidate] = useState<number | null>(null)
  const [reactions, setReactions] = useState(SOTD.reactions)

  const filteredMusic = NEW_MUSIC.filter(r => {
    if (musicFilter === 'Tik LT') return r.lt
    if (musicFilter === 'Singlai') return r.type === 'Singl'
    if (musicFilter === 'Albumai') return r.type === 'Albumas'
    if (musicFilter === 'EP') return r.type === 'EP'
    return true
  })

  const filteredEvents = eventCity === 'Visi' ? EVENTS : EVENTS.filter(e => e.city === eventCity)

  const chartData = chartTab === 'official' ? CHARTS_LT : CHARTS_COMMUNITY

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white">

      {/* ── HEADER ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/6 bg-[#0a0b0e]/95 backdrop-blur-xl">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-4">
          <Link href="/" className="flex-shrink-0">
            <span className="font-black text-2xl tracking-tight">
              <span className="text-white">music</span><span className="text-orange-400">.lt</span>
            </span>
          </Link>

          <div className="flex-1 max-w-lg hidden md:block">
            <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
              className="w-full bg-white/5 border border-white/8 rounded-full px-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all" />
          </div>

          <nav className="hidden sm:flex items-center gap-1 ml-auto mr-3">
            {['Topai', 'Muzika', 'Renginiai', 'Atlikėjai'].map(item => (
              <a key={item} href="#" className="px-3 py-1.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all font-medium">{item}</a>
            ))}
          </nav>

          <HeaderAuth />
        </div>
      </header>

      {/* ── HERO: ECOSYSTEM BLOCK ────────────────────────────────────── */}
      <section className="border-b border-white/6 bg-gradient-to-b from-blue-950/30 to-transparent">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4">Šią savaitę Lietuvoje</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

            {/* #1 Daina */}
            <div className="sm:col-span-2 bg-blue-600/10 border border-blue-500/20 rounded-2xl p-5 flex items-center gap-4 hover:bg-blue-600/15 transition-colors cursor-pointer group">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl flex-shrink-0">🎵</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-black text-blue-400">#1 DAINA</span>
                  <span className="text-[10px] text-gray-500">{WEEK_SUMMARY.song.wks} sav.</span>
                </div>
                <h3 className="font-black text-base leading-tight group-hover:text-blue-300 transition-colors">{WEEK_SUMMARY.song.artist}</h3>
                <p className="text-sm text-gray-400">{WEEK_SUMMARY.song.title}</p>
                <p className="text-xs text-gray-600 mt-1">{WEEK_SUMMARY.song.streams} srautų</p>
              </div>
              <button className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors">
                Klausyti
              </button>
            </div>

            {/* #1 Albumas */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-5 hover:bg-white/6 transition-colors cursor-pointer group">
              <span className="text-xs font-black text-gray-500">#1 ALBUMAS</span>
              <div className="mt-2">
                <h3 className="font-black text-sm group-hover:text-white transition-colors">{WEEK_SUMMARY.album.artist}</h3>
                <p className="text-sm text-gray-400">{WEEK_SUMMARY.album.title}</p>
                <Chip variant="green">{WEEK_SUMMARY.album.released}</Chip>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-black text-gray-500">SAVAITĖS SKAIČIAI</span>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">Nauji leidiniai</span>
                    <span className="text-sm font-black text-white">{WEEK_SUMMARY.newReleases}</span>
                  </div>
                  {WEEK_SUMMARY.events.map((e, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 truncate">{e.title}</span>
                      <span className="text-xs text-orange-400 ml-2 flex-shrink-0">{e.d} {e.m}</span>
                    </div>
                  ))}
                </div>
              </div>
              <a href="#" className="text-xs text-blue-400 hover:text-blue-300 transition-colors mt-3 font-semibold">Peržiūrėti topus →</a>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">

        {/* ── TOPAI ────────────────────────────────────────────────────── */}
        <section>
          <SectionHead cta="Visi topai">Topai</SectionHead>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Chart table */}
            <div className="lg:col-span-2 bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
              <div className="flex border-b border-white/8">
                <button onClick={() => setChartTab('official')}
                  className={`flex-1 py-3 text-sm font-bold transition-all ${chartTab === 'official' ? 'text-white bg-white/5 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  🏛️ Oficialūs (AGATA)
                </button>
                <button onClick={() => setChartTab('community')}
                  className={`flex-1 py-3 text-sm font-bold transition-all ${chartTab === 'community' ? 'text-white bg-white/5 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  🗳️ Music.lt balsavimas
                </button>
              </div>

              <div className="divide-y divide-white/4">
                {chartData.map((track) => (
                  <div key={track.pos} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/4 transition-colors cursor-pointer group">
                    <span className={`w-5 text-center font-black text-sm flex-shrink-0 ${track.pos <= 3 ? 'text-blue-400' : 'text-gray-700'}`}>{track.pos}</span>
                    <TrendBadge trend={track.trend} />
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] text-white/20 font-black" style={{ background: `hsl(${track.pos * 37},35%,18%)` }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white truncate group-hover:text-blue-300 transition-colors">{track.title}</span>
                        <FlagLT show={track.lt} />
                      </div>
                      <div className="text-xs text-gray-500 truncate">{track.artist}</div>
                    </div>
                    {'wks' in track && typeof (track as {wks?: number}).wks === 'number' && (
                      <span className="text-[10px] text-gray-700 flex-shrink-0">{(track as {wks?: number}).wks} sav.</span>
                    )}
                    {'votes' in track && (
                      <span className="text-[10px] text-gray-500 flex-shrink-0">{(track as {votes?: number}).votes} ▲</span>
                    )}
                  </div>
                ))}
              </div>

              {chartTab === 'community' && (
                <div className="p-4 border-t border-white/6 bg-orange-500/5">
                  <button className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                    🗳️ Balsuoti už dainą
                  </button>
                </div>
              )}
            </div>

            {/* Climbers sidebar */}
            <div className="space-y-3">
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Labiausiai kylantys</p>
                {CHARTS_LT.filter(t => t.trend === 'up').slice(0, 3).map((t, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                    <span className="text-emerald-400 font-black text-sm">↑</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{t.title}</p>
                      <p className="text-xs text-gray-500 truncate">{t.artist}</p>
                    </div>
                    <span className="text-xs text-gray-700">#{t.pos}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">Nauji įrašai</p>
                {CHARTS_LT.filter(t => t.trend === 'new').map((t, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <span className="text-amber-400 font-black text-xs">NEW</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{t.title}</p>
                      <p className="text-xs text-gray-500 truncate">{t.artist}</p>
                    </div>
                    <span className="text-xs text-gray-700">#{t.pos}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── NAUJA MUZIKA ─────────────────────────────────────────────── */}
        <section>
          <SectionHead cta="Visa nauja muzika">Nauja muzika</SectionHead>
          <div className="flex gap-2 mb-4 flex-wrap">
            {MUSIC_FILTERS.map(f => (
              <button key={f} onClick={() => setMusicFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${musicFilter === f ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}>
                {f === 'Tik LT' ? '🇱🇹 ' + f : f}
              </button>
            ))}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {filteredMusic.map((r, i) => (
              <div key={i} className="flex-shrink-0 w-[148px] group cursor-pointer">
                <div className="aspect-square rounded-xl mb-3 flex items-center justify-center relative overflow-hidden" style={{ background: r.color }}>
                  <span className="text-4xl text-white/10 font-black">♪</span>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="text-white text-xl opacity-0 group-hover:opacity-100 transition-opacity">▶</span>
                  </div>
                  {r.lt && <span className="absolute top-2 left-2 text-sm" title="Lietuvos atlikėjas">🇱🇹</span>}
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Chip variant={r.type === 'Singl' ? 'blue' : r.type === 'EP' ? 'purple' : 'green'}>{r.type}</Chip>
                </div>
                <p className="text-xs text-gray-500">{r.artist}</p>
                <h4 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors leading-snug mt-0.5">{r.title}</h4>
                <button className="mt-2 text-xs text-orange-400 hover:text-orange-300 font-semibold transition-colors">Klausyti →</button>
              </div>
            ))}
          </div>
        </section>

        {/* ── DIENOS DAINA ─────────────────────────────────────────────── */}
        <section>
          <SectionHead>🎵 Dienos daina</SectionHead>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

            {/* Main SOTD card */}
            <div className="lg:col-span-2 bg-gradient-to-br from-blue-900/40 to-blue-950/60 border border-blue-500/20 rounded-2xl p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center text-3xl flex-shrink-0">🎵</div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-1">Siūlo <span className="text-blue-400 font-bold">{SOTD.by}</span></p>
                  <h3 className="font-black text-xl leading-tight">{SOTD.artist}</h3>
                  <p className="text-gray-300">{SOTD.title}</p>
                </div>
              </div>

              {/* Reactions */}
              <div className="flex items-center gap-2 mb-5">
                <button onClick={() => setReactions(r => ({ ...r, fire: r.fire + 1 }))}
                  className="flex items-center gap-1.5 bg-white/8 hover:bg-white/12 px-3 py-1.5 rounded-full text-sm transition-colors font-medium">
                  🔥 <span>{reactions.fire}</span>
                </button>
                <button onClick={() => setReactions(r => ({ ...r, heart: r.heart + 1 }))}
                  className="flex items-center gap-1.5 bg-white/8 hover:bg-white/12 px-3 py-1.5 rounded-full text-sm transition-colors font-medium">
                  ❤️ <span>{reactions.heart}</span>
                </button>
                <button onClick={() => setReactions(r => ({ ...r, star: r.star + 1 }))}
                  className="flex items-center gap-1.5 bg-white/8 hover:bg-white/12 px-3 py-1.5 rounded-full text-sm transition-colors font-medium">
                  ⭐ <span>{reactions.star}</span>
                </button>
              </div>

              <button className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">
                Klausyti Spotify →
              </button>
              <p className="text-xs text-gray-600 mt-3 text-center">Vakar: {SOTD.yesterday.artist} — {SOTD.yesterday.title}</p>
            </div>

            {/* Candidates */}
            <div className="lg:col-span-3 bg-white/3 border border-white/8 rounded-2xl p-5">
              <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-4">Rytdienos pretendentai — balsuokite!</p>
              <div className="space-y-2">
                {SOTD.candidates.map((c, i) => (
                  <button key={i} onClick={() => setVotedCandidate(i)} disabled={votedCandidate !== null}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${votedCandidate === i ? 'bg-blue-600/20 border border-blue-500/40' : 'bg-white/4 hover:bg-white/8 border border-transparent'} ${votedCandidate !== null && votedCandidate !== i ? 'opacity-50' : ''}`}>
                    <span className="text-sm font-black text-gray-600 w-5 text-center">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{c.artist}</p>
                      <p className="text-xs text-gray-400">{c.title}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-white">{votedCandidate === i ? c.votes + 1 : c.votes}</p>
                      <p className="text-[10px] text-gray-600">balsų</p>
                    </div>
                    {votedCandidate === null && <span className="text-xs text-blue-400 font-bold flex-shrink-0">Balsuoti</span>}
                    {votedCandidate === i && <span className="text-xs text-emerald-400 font-bold flex-shrink-0">✓</span>}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-700 mt-4">Pasiūlyk savo dainą ryt → <a href="#" className="text-blue-400 hover:underline">Siūlyti</a></p>
            </div>
          </div>
        </section>

        {/* ── RENGINIAI + PRESS 2-col ───────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Renginiai */}
          <section>
            <SectionHead cta="Visi renginiai">Renginiai</SectionHead>
            <div className="flex gap-2 mb-4 flex-wrap">
              {CITIES.map(c => (
                <button key={c} onClick={() => setEventCity(c)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${eventCity === c ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {filteredEvents.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center gap-4 bg-white/3 hover:bg-white/6 border border-white/6 rounded-xl px-4 py-3 cursor-pointer group transition-all">
                  <div className="text-center w-8 flex-shrink-0">
                    <p className="text-base font-black leading-none">{e.d}</p>
                    <p className="text-[9px] font-black text-orange-400 uppercase">{e.m}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate group-hover:text-blue-300 transition-colors">{e.title}</p>
                    <p className="text-xs text-gray-500">{e.venue} · {e.city}</p>
                  </div>
                  {e.sold
                    ? <Chip variant="red">Parduota</Chip>
                    : <button className="text-xs font-bold text-orange-400 flex-shrink-0 hover:text-orange-300">Bilietai →</button>
                  }
                </div>
              ))}
            </div>
          </section>

          {/* Atlikėjų pranešimai */}
          <section>
            <SectionHead cta="Visos naujienos">Atlikėjų pranešimai</SectionHead>
            <div className="space-y-2">
              {PRESS.map((p, i) => (
                <div key={i} className="flex gap-3 bg-white/3 hover:bg-white/6 border border-white/6 rounded-xl p-4 cursor-pointer group transition-all">
                  <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center font-black text-sm flex-shrink-0 text-white/40">
                    {p.artist[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip variant={p.label === 'Oficialus pranešimas' ? 'blue' : p.label === 'Renginys' ? 'green' : 'default'}>
                        {p.label}
                      </Chip>
                      {p.ai && <Chip variant="purple">AI santrauka</Chip>}
                      <span className="text-[10px] text-gray-600">{p.ago}</span>
                    </div>
                    <p className="text-sm font-medium text-white group-hover:text-blue-300 transition-colors leading-snug">{p.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── GYVI POKALBIAI ───────────────────────────────────────────── */}
        <section>
          <SectionHead cta="Visi pokalbiai">💬 Gyvi pokalbiai</SectionHead>
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="divide-y divide-white/5">
              {SHOUTBOX.map((s, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-white/3 transition-colors">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 text-white/50" style={{ background: `hsl(${s.user.charCodeAt(0) * 17 % 360},40%,22%)` }}>
                    {s.user[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-blue-400">{s.user}</span>
                    <span className="text-xs text-gray-600 ml-2">{s.ago}</span>
                    <p className="text-sm text-gray-300 leading-relaxed">{s.msg}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-white/6 bg-white/2 flex gap-3">
              <input type="text" placeholder="Rašyk žinutę… (reikia prisijungti)"
                className="flex-1 bg-white/5 border border-white/8 rounded-full px-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-500/40 transition-all" />
              <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-full text-sm transition-colors">Siųsti</button>
            </div>
          </div>
        </section>

        {/* ── ATLIKĖJAMS ───────────────────────────────────────────────── */}
        <section>
          <div className="border border-white/8 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-5 bg-white/2">
            <div className="text-4xl flex-shrink-0">🎤</div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="font-black text-lg">Atlikėjams</h3>
              <p className="text-gray-400 text-sm mt-1">Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams.</p>
            </div>
            <button className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-full transition-colors text-sm">
              Pradėti →
            </button>
          </div>
        </section>

      </div>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-[#070709] mt-8">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="font-black text-xl mb-2"><span className="text-white">music</span><span className="text-orange-400">.lt</span></div>
              <p className="text-sm text-gray-700 leading-relaxed">Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
            </div>
            {[
              { t: 'Platformа', l: ['Topai', 'Nauja muzika', 'Renginiai', 'Atlikėjai', 'Albumai'] },
              { t: 'Bendruomenė', l: ['Diskusijos', 'Blogai', 'Gyvi pokalbiai', 'Dienos daina'] },
              { t: 'Informacija', l: ['Apie mus', 'Atlikėjams', 'Reklama', 'Kontaktai', 'Privatumas'] },
            ].map(col => (
              <div key={col.t}>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-700 mb-3">{col.t}</h4>
                <ul className="space-y-2">
                  {col.l.map(l => <li key={l}><a href="#" className="text-sm text-gray-700 hover:text-white transition-colors">{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-3">
            <span className="text-xs text-gray-800">© 2026 Music.lt — Visos teisės saugomos</span>
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
