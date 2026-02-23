'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { HeaderAuth } from '@/components/HeaderAuth'
import Link from 'next/link'

// ── MOCK DATA ──────────────────────────────────────────────────────────────────

const SLIDES_LT = [
  {
    chip: '#1 Lietuvoje', chipBg: '#f97316', kicker: '3 savaitė iš eilės',
    artist: 'Silvester Belt', title: 'Bend The Lie',
    desc: 'Oficiali Lietuvos daina „Eurovision 2026" — jau viršuje visoje Europoje.',
    cta: 'Klausyti', ctaSecondary: 'Profilis',
    bg: 'linear-gradient(135deg, #0f1729 0%, #1e1035 50%, #0f1729 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(99,102,241,0.35) 0%, transparent 60%)',
    cover: '#3730a3',
  },
  {
    chip: 'Premjera', chipBg: '#2563eb', kicker: 'Albumas jau pasiekiamas',
    artist: 'Jurga', title: 'Vasaros Naktys',
    desc: 'Jau 5 savaitė TOP 10 — klausytojų mėgstamiausias šio sezono albumas.',
    cta: 'Klausyti albumą', ctaSecondary: 'Peržiūrėti',
    bg: 'linear-gradient(135deg, #0a1628 0%, #0c2a1e 50%, #0a1628 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(16,185,129,0.28) 0%, transparent 60%)',
    cover: '#065f46',
  },
  {
    chip: 'Renginys', chipBg: '#059669', kicker: 'Vasario 22 d. • Kaunas',
    artist: 'Kęstutis Antanėlis', title: 'Žalgirio Arena',
    desc: 'Didžiausias šių metų koncertas Lietuvoje. Bilietų lieka nedaug.',
    cta: 'Pirkti bilietą', ctaSecondary: 'Daugiau info',
    bg: 'linear-gradient(135deg, #0a1628 0%, #1a1206 50%, #0a1628 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(245,158,11,0.28) 0%, transparent 60%)',
    cover: '#92400e',
  },
  {
    chip: 'Atlikėjas', chipBg: '#7c3aed', kicker: 'Šiandien 1.2M klausytojų',
    artist: 'Monika Liu', title: 'Lietuvos balso veidas',
    desc: 'Nuo „Eurovision" iki pasaulio scenų — sekite paskutines naujienas.',
    cta: 'Peržiūrėti profilį', ctaSecondary: 'Klausyti',
    bg: 'linear-gradient(135deg, #0f0a1e 0%, #1a0a2e 50%, #0f0a1e 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(139,92,246,0.32) 0%, transparent 60%)',
    cover: '#4c1d95',
  },
]

const SLIDES_WORLD = [
  {
    chip: '#1 Pasaulyje', chipBg: '#dc2626', kicker: '6 savaitė iš eilės',
    artist: 'Rose & Bruno Mars', title: 'APT.',
    desc: 'Hito hitų — virusinis duetas valdantis pasaulio charts.',
    cta: 'Klausyti', ctaSecondary: 'Daugiau',
    bg: 'linear-gradient(135deg, #1a0a0a 0%, #2a0a1e 50%, #1a0a0a 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(220,38,38,0.28) 0%, transparent 60%)',
    cover: '#7f1d1d',
  },
  {
    chip: 'Premjera', chipBg: '#0891b2', kicker: 'Naujausias singlas',
    artist: 'Billie Eilish', title: 'Birds of a Feather',
    desc: 'Naujausias kūrinys iš albumo „Hit Me Hard and Soft".',
    cta: 'Klausyti', ctaSecondary: 'Profilis',
    bg: 'linear-gradient(135deg, #050d14 0%, #071a2a 50%, #050d14 100%)',
    glow: 'radial-gradient(ellipse at 30% 60%, rgba(8,145,178,0.28) 0%, transparent 60%)',
    cover: '#0c4a6e',
  },
]

const CHARTS_LT30 = [
  { pos: 1, artist: 'Monika Liu', title: 'Sentimentai', wks: 4, lt: true, trend: 'same' },
  { pos: 2, artist: 'Silvester Belt', title: 'Bend The Lie', wks: 2, lt: true, trend: 'up' },
  { pos: 3, artist: 'Jazzu', title: 'Kur Eisi', wks: 7, lt: true, trend: 'down' },
  { pos: 4, artist: 'Galerija', title: 'Naktis', wks: 3, lt: true, trend: 'up' },
  { pos: 5, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', wks: 1, lt: true, trend: 'new' },
  { pos: 6, artist: 'Andrius Mamontovas', title: 'Laikas', wks: 9, lt: true, trend: 'down' },
  { pos: 7, artist: 'Jurga', title: 'Vasaros Naktys', wks: 5, lt: true, trend: 'up' },
]

const CHARTS_TOP40 = [
  { pos: 1, artist: 'Rose & Bruno Mars', title: 'APT.', lt: false, trend: 'same' },
  { pos: 2, artist: 'Lady Gaga', title: 'Disease', lt: false, trend: 'up' },
  { pos: 3, artist: 'Sabrina Carpenter', title: 'Espresso', lt: false, trend: 'down' },
  { pos: 4, artist: 'Billie Eilish', title: 'Birds of a Feather', lt: false, trend: 'up' },
  { pos: 5, artist: 'Chappell Roan', title: 'Good Luck, Babe!', lt: false, trend: 'new' },
  { pos: 6, artist: 'Kendrick Lamar', title: 'Luther', lt: false, trend: 'up' },
  { pos: 7, artist: 'SZA', title: 'Saturn', lt: false, trend: 'down' },
]

const SINGLES = [
  { artist: 'Monika Liu', title: 'Palauk', lt: true, hue: 280 },
  { artist: 'Silvester Belt', title: 'Bend The Lie', lt: true, hue: 225 },
  { artist: 'Dž. Džo', title: 'Vilniaus Vakaras', lt: true, hue: 200 },
  { artist: 'Andrius Mamontovas', title: 'Laikas', lt: true, hue: 160 },
  { artist: 'Saulės Kliošas', title: 'Ruduo', lt: true, hue: 320 },
  { artist: 'Jazzu', title: 'Šviesa', lt: true, hue: 38 },
  { artist: 'Inculto', title: 'Grįžau', lt: true, hue: 5 },
  { artist: 'Skamp', title: 'Again', lt: true, hue: 260 },
]

const ALBUMS_EP = [
  { type: 'Albumas', artist: 'Jurga', title: 'Vasaros Naktys', lt: true, hue: 155, tracks: 11 },
  { type: 'Albumas', artist: 'Galerija', title: 'Naktis', lt: true, hue: 42, tracks: 8 },
  { type: 'EP', artist: 'Saulės Kliošas', title: 'Rugsėjis', lt: true, hue: 320, tracks: 5 },
  { type: 'Albumas', artist: 'Dainava', title: 'Tamsoje', lt: true, hue: 260, tracks: 9 },
  { type: 'Albumas', artist: 'Inculto', title: 'Retro', lt: true, hue: 5, tracks: 13 },
  { type: 'EP', artist: 'Jazzu', title: 'Šilumos EP', lt: true, hue: 200, tracks: 4 },
  { type: 'Albumas', artist: 'Skamp', title: 'Sugrįžimas', lt: true, hue: 180, tracks: 12 },
  { type: 'EP', artist: 'Dž. Džo', title: 'Vilnius Naktį', lt: true, hue: 290, tracks: 6 },
]

const SOTD = {
  artist: 'Foje', title: 'Žmogus Kuris Nemoka Šokti',
  by: 'rokaslt', hue: 220,
  rx: { fire: 124, heart: 89, star: 56 },
  yesterday: 'Monika Liu — Sentimentai',
}

const SOTD_CANDIDATES = [
  { artist: 'Monika Liu', title: 'Sentimentai', votes: 31 },
  { artist: 'Andrius Mamontovas', title: 'Laikas', votes: 28 },
  { artist: 'Jazzu', title: 'Kur Eisi', votes: 24 },
  { artist: 'Jurga', title: 'Vasaros Naktys', votes: 19 },
  { artist: 'Galerija', title: 'Naktis', votes: 17 },
  { artist: 'Skamp', title: 'Come Back To Me', votes: 14 },
  { artist: 'Silvester Belt', title: 'Bend The Lie', votes: 12 },
  { artist: 'Dž. Džo', title: 'Vilniaus Vakaras', votes: 9 },
  { artist: 'Dainava', title: 'Tamsoje', votes: 7 },
  { artist: 'Saulės Kliošas', title: 'Rugsėjis', votes: 5 },
]

const EVENTS = [
  { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
  { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', venue: 'Tamsta Club', city: 'Vilnius', sold: false },
  { d: '01', m: 'KOV', title: 'Jurga & Orkestras', venue: 'LNFO', city: 'Vilnius', sold: false },
  { d: '15', m: 'KOV', title: 'Donatas Montvydas', venue: 'Compensa', city: 'Vilnius', sold: true },
  { d: '22', m: 'KOV', title: 'Andrius Mamontovas', venue: 'Forum Palace', city: 'Vilnius', sold: false },
]

const COMMUNITY = [
  { type: 'disk.', user: 'muzikoslt', title: 'Kaip vertinate naują Skamp albumą?', replies: 47, ago: '2 val.' },
  { type: 'blog', user: 'rockfanas', title: 'Mano top 10 LT albumų 2025 metais', replies: 12, ago: '5 val.' },
  { type: 'rec.', user: 'jazzlover', title: 'Jurga „Vasaros Naktys" — recenzija', replies: 8, ago: '1 d.' },
  { type: 'disk.', user: 'indie_lt', title: 'Geriausias LT indie albumas šiais metais?', replies: 23, ago: '1 d.' },
]

const SHOUTBOX = [
  { user: 'muzikoslt', msg: 'Kas žino kada bus kitas Skamp koncertas?', ago: '2 min.' },
  { user: 'rockfanas', msg: 'Mamontovas 🔥 visiška legenda', ago: '5 min.' },
  { user: 'jazzlover', msg: 'Ieškau bilieto į Jurgą 03-01', ago: '12 min.' },
  { user: 'indie_lt', msg: 'Saulės Kliošo EP yra fire 🎶', ago: '18 min.' },
]

const DISCOVER_ARTISTS = [
  { name: 'Monika Liu', genre: 'Pop / Soul', hue: 280, new: false },
  { name: 'Dž. Džo', genre: 'Hip-hop', hue: 30, new: true },
  { name: 'Saulės Kliošas', genre: 'Indie', hue: 320, new: true },
  { name: 'Galerija', genre: 'Elektronika', hue: 155, new: false },
  { name: 'Jazzu', genre: 'R&B / Soul', hue: 200, new: false },
  { name: 'Skamp', genre: 'Pop', hue: 180, new: false },
]

const CITIES = ['Visi', 'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai']
const GENRES = ['Visi', 'Pop', 'Rokas', 'Hip-hop', 'Elektronika', 'Folk', 'Jazz']

// ── ATOMS ──────────────────────────────────────────────────────────────────────

function Pill({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all select-none whitespace-nowrap ${
        active ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-900/40'
               : 'text-[#8b9ab5] border border-white/8 hover:text-white hover:border-white/18'}`}>
      {children}
    </button>
  )
}

function TI({ t }: { t: string }) {
  if (t === 'up') return <span className="text-emerald-400 font-black text-xs">↑</span>
  if (t === 'down') return <span className="text-red-400 font-black text-xs">↓</span>
  if (t === 'new') return <span className="text-[9px] font-black text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded">N</span>
  return <span className="text-[#2a3a50] text-xs">—</span>
}

function PlayBtn({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-8 h-8 text-sm', md: 'w-11 h-11 text-base', lg: 'w-14 h-14 text-xl' }[size]
  return (
    <div className={`${s} rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center transition-all shadow-xl cursor-pointer hover:scale-105`}>
      <span className="text-white ml-0.5">▶</span>
    </div>
  )
}

function SecHead({ label, cta }: { label: React.ReactNode; cta?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-[20px] font-black text-white tracking-tight">{label}</h2>
      {cta && <a href="#" className="text-sm text-[#4a6fa5] hover:text-white transition-colors font-semibold">{cta} →</a>}
    </div>
  )
}

const CARD_STYLE = { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }
const CARD_HOVER = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.14)' },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)' },
}

// ── MAIN ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [lens, setLens] = useState<'lt' | 'world'>('lt')
  const [idx, setIdx] = useState(0)
  const [chartTab, setChartTab] = useState<'lt30' | 'top40'>('lt30')
  const [musicTab, setMusicTab] = useState<'singles' | 'albums'>('singles')
  const [genre, setGenre] = useState('Visi')
  const [city, setCity] = useState('Visi')
  const [rx, setRx] = useState(SOTD.rx)
  const [voted, setVoted] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slides = lens === 'lt' ? SLIDES_LT : SLIDES_WORLD

  const goTo = useCallback((i: number, total: number) => {
    setIdx(((i % total) + total) % total)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    setIdx(0)
  }, [lens])

  useEffect(() => {
    timerRef.current = setTimeout(() => setIdx(p => (p + 1) % slides.length), 7000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [idx, slides.length])

  const s = slides[Math.min(idx, slides.length - 1)]
  const chartData = chartTab === 'lt30' ? CHARTS_LT30 : CHARTS_TOP40
  const musicItems = musicTab === 'singles' ? SINGLES : ALBUMS_EP
  const events = city === 'Visi' ? EVENTS : EVENTS.filter(e => e.city === city)

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d1117' }}>

      {/* ━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06]"
        style={{ background: 'rgba(13,17,23,0.94)', backdropFilter: 'blur(24px)' }}>
        <div className="max-w-[1360px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-4">
          <Link href="/" className="font-black text-[22px] tracking-tight flex-shrink-0">
            <span className="text-white">music</span><span className="text-orange-400">.lt</span>
          </Link>

          <div className="flex-1 max-w-sm hidden md:block">
            <input type="text" placeholder="Ieškok atlikėjų, dainų, renginių…"
              className="w-full h-9 rounded-full px-4 text-sm text-white/80 placeholder:text-[#3d5070] focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
          </div>

          <nav className="hidden lg:flex items-center gap-0.5 ml-2">
            {['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė'].map(n => (
              <a key={n} href="#"
                className="px-3 py-1.5 text-[13px] text-[#6b88b0] hover:text-white rounded-lg hover:bg-white/5 transition-all font-semibold">{n}</a>
            ))}
          </nav>

          {/* LT / World switch */}
          <div className="ml-auto mr-3 flex items-center rounded-full p-0.5 gap-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setLens('lt')}
              className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${lens === 'lt' ? 'bg-[#1d4ed8] text-white shadow-md' : 'text-[#4a6080] hover:text-white'}`}>
              🇱🇹 LT
            </button>
            <button onClick={() => setLens('world')}
              className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${lens === 'world' ? 'bg-[#1d4ed8] text-white shadow-md' : 'text-[#4a6080] hover:text-white'}`}>
              🌍 Pasaulis
            </button>
          </div>

          <HeaderAuth />
        </div>
      </header>

      {/* ━━ HERO + TOPAI SIDE BY SIDE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative" style={{ background: s.bg, transition: 'background 0.8s ease' }}>
        <div className="absolute inset-0 pointer-events-none transition-all duration-700" style={{ background: s.glow }} />
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative max-w-[1360px] mx-auto px-5 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-0">

            {/* ── HERO (65%) ── */}
            <div className="flex-1 lg:pr-6 py-12 flex flex-col sm:flex-row items-center gap-8 sm:gap-12 min-h-[380px]">
              {/* Cover */}
              <div className="flex-shrink-0 relative group cursor-pointer">
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl flex items-center justify-center text-7xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                  style={{ background: s.cover, boxShadow: `0 32px 80px ${s.cover}66, 0 8px 24px rgba(0,0,0,0.7)` }}>
                  ♪
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <PlayBtn size="lg" />
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start mb-3">
                  <span className="px-3 py-1 rounded-full text-xs font-black text-white" style={{ background: s.chipBg }}>{s.chip}</span>
                  <span className="text-sm text-white/35 font-medium">{s.kicker}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight mb-1">{s.artist}</h1>
                <p className="text-xl sm:text-2xl text-white/45 font-light mb-4 tracking-wide">{s.title}</p>
                <p className="text-white/40 text-sm leading-relaxed mb-7 max-w-md">{s.desc}</p>
                <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                  <button className="bg-orange-500 hover:bg-orange-400 text-white font-black px-7 py-3 rounded-full text-sm transition-all shadow-lg shadow-orange-900/50 hover:scale-[1.02]">
                    {s.cta}
                  </button>
                  <button className="text-white/45 hover:text-white font-semibold px-5 py-3 rounded-full text-sm transition-all border border-white/10 hover:border-white/20">
                    {s.ctaSecondary}
                  </button>
                </div>
              </div>

              {/* Arrows + Dots */}
              <div className="hidden sm:flex flex-col gap-2 flex-shrink-0">
                {[-1, 1].map(dir => (
                  <button key={dir} onClick={() => goTo(idx + dir, slides.length)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-white transition-all hover:bg-white/10"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                    {dir === -1 ? '←' : '→'}
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="hidden lg:block w-px bg-white/[0.07] my-8 flex-shrink-0" />

            {/* ── TOPAI SIDEBAR (35%) ── */}
            <div className="lg:w-[360px] flex-shrink-0 py-8 lg:pl-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {[{ k: 'lt30', l: '🇱🇹 LT Top 30' }, { k: 'top40', l: '🌍 Top 40' }].map(tab => (
                    <button key={tab.k} onClick={() => setChartTab(tab.k as 'lt30' | 'top40')}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${chartTab === tab.k ? 'bg-[#1d4ed8] text-white' : 'text-[#4a6080] hover:text-[#8ba5c8]'}`}>
                      {tab.l}
                    </button>
                  ))}
                </div>
                <a href="#" className="text-xs text-[#4a6fa5] hover:text-white font-semibold transition-colors">Visi →</a>
              </div>

              <div className="space-y-0.5">
                {chartData.map((t, i) => (
                  <div key={t.pos}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    style={{ borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span className={`w-5 text-center text-sm font-black flex-shrink-0 ${t.pos <= 3 ? 'text-orange-400' : 'text-[#2a3a50]'}`}>{t.pos}</span>
                    <div className="w-4 flex items-center justify-center flex-shrink-0"><TI t={t.trend} /></div>
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] text-white/10 font-black"
                      style={{ background: `hsl(${t.pos * 43},30%,14%)` }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[13px] font-semibold text-white/85 truncate group-hover:text-blue-300 transition-colors">{t.title}</span>
                        {t.lt && <span className="text-[10px] opacity-60 flex-shrink-0">🇱🇹</span>}
                      </div>
                      <span className="text-[11px] text-[#3d5070] truncate block">{t.artist}</span>
                    </div>
                    {'wks' in t && typeof (t as {wks?: number}).wks === 'number' && (
                      <span className="text-[10px] text-[#1e2e42] flex-shrink-0">{(t as {wks: number}).wks}w</span>
                    )}
                  </div>
                ))}
              </div>

              <button className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold text-[#4a6fa5] hover:text-white transition-all hover:bg-white/[0.04]"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                Žiūrėti visą topą →
              </button>
            </div>
          </div>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 lg:left-[32.5%] flex gap-2 items-center">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i, slides.length)}
                className={`rounded-full transition-all duration-300 ${i === idx ? 'w-6 h-1.5 bg-orange-400' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'}`} />
            ))}
          </div>
        </div>
      </section>

      {/* ━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12 space-y-16">

        {/* ━━ NAUJA MUZIKA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Nauja muzika" cta="Visi leidiniai" />
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            {/* Music type tabs */}
            <div className="flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {[{ k: 'singles', l: 'Singlai' }, { k: 'albums', l: 'Albumai / EP' }].map(t => (
                <button key={t.k} onClick={() => setMusicTab(t.k as 'singles' | 'albums')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${musicTab === t.k ? 'bg-[#1d4ed8] text-white' : 'text-[#4a6080] hover:text-white'}`}>
                  {t.l}
                </button>
              ))}
            </div>
            {/* Genre pills */}
            <div className="flex gap-2 flex-wrap">
              {GENRES.map(g => <Pill key={g} active={genre === g} onClick={() => setGenre(g)}>{g}</Pill>)}
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-4">
            {musicItems.map((r, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-square rounded-xl mb-2.5 relative overflow-hidden transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{ background: `hsl(${r.hue},38%,15%)`, boxShadow: `0 12px 32px hsl(${r.hue},38%,6%)` }}>
                  <div className="absolute inset-0 flex items-center justify-center text-5xl text-white/[0.05] font-black select-none">♪</div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 duration-200">
                      <PlayBtn size="sm" />
                    </div>
                  </div>
                  {r.lt && <span className="absolute top-1.5 left-1.5 text-xs drop-shadow-lg opacity-80">🇱🇹</span>}
                  {'type' in r && (
                    <span className={`absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded text-white ${
                      (r as {type: string}).type === 'EP' ? 'bg-violet-700/80' : 'bg-emerald-800/80'}`}>
                      {(r as {type: string}).type}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#3d5070] truncate">{r.artist}</p>
                <h4 className="text-[12px] font-bold text-white/80 group-hover:text-blue-300 transition-colors leading-snug truncate">{r.title}</h4>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ DIENOS DAINA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="🎵 Dienos daina" />
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">

            {/* Main card */}
            <div className="rounded-2xl p-7 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.28) 0%, rgba(13,17,23,0.95) 100%)', border: '1px solid rgba(29,78,216,0.22)' }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 10% 80%, rgba(29,78,216,0.12) 0%, transparent 55%)' }} />
              <div className="relative flex items-start gap-5 mb-6">
                <div className="relative group flex-shrink-0 cursor-pointer">
                  <div className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl shadow-2xl"
                    style={{ background: `hsl(${SOTD.hue},45%,15%)`, boxShadow: `0 16px 40px hsl(${SOTD.hue},45%,7%)` }}>
                    🎵
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <PlayBtn size="sm" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#4a6080] mb-1">Siūlo <span className="text-blue-400 font-bold">{SOTD.by}</span></p>
                  <h3 className="font-black text-2xl text-white leading-tight">{SOTD.artist}</h3>
                  <p className="text-white/45 text-sm mt-0.5">{SOTD.title}</p>
                </div>
              </div>
              <div className="relative flex gap-2 mb-5">
                {([['fire', '🔥', rx.fire], ['heart', '❤️', rx.heart], ['star', '⭐', rx.star]] as const).map(([k, e, c]) => (
                  <button key={k} onClick={() => setRx(r => ({ ...r, [k]: r[k as keyof typeof r] + 1 }))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    {e} <span className="text-white/80">{c}</span>
                  </button>
                ))}
              </div>
              <button className="relative w-full bg-orange-500 hover:bg-orange-400 text-white font-black py-3 rounded-xl text-sm transition-all shadow-lg shadow-orange-900/40">
                Klausyti →
              </button>
              <p className="relative text-[11px] text-[#2a3a50] mt-3 text-center">Vakar: {SOTD.yesterday}</p>
            </div>

            {/* Candidates list */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
                <p className="text-[11px] font-black text-[#2a3a50] uppercase tracking-[0.12em]">Rytdienos balsavimas</p>
                <a href="#" className="text-[11px] text-[#4a6fa5] hover:text-white font-semibold transition-colors">+ Siūlyti dainą</a>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-[340px] overflow-y-auto">
                {SOTD_CANDIDATES.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
                    <span className="text-[#1e2e42] font-black text-sm w-5 text-center flex-shrink-0">#{i + 1}</span>
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-[9px] text-white/10"
                      style={{ background: `hsl(${i * 37},30%,14%)` }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white/85 truncate">{c.artist}</p>
                      <p className="text-[11px] text-[#3d5070] truncate">{c.title}</p>
                    </div>
                    <span className="text-sm font-black text-white/60 flex-shrink-0 w-8 text-right">{voted === i ? c.votes + 1 : c.votes}</span>
                    <button onClick={() => voted === null && setVoted(i)} disabled={voted !== null}
                      className={`text-xs font-black px-3 py-1.5 rounded-full flex-shrink-0 transition-all ${
                        voted === i ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-700/30'
                        : voted !== null ? 'text-[#2a3a50] border border-white/5 opacity-40'
                        : 'text-blue-400 border border-blue-800/40 hover:bg-blue-900/20'}`}>
                      {voted === i ? '✓' : 'Balsuoti'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ━━ RENGINIAI + GYVI POKALBIAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          <section>
            <SecHead label="Renginiai" cta="Visi renginiai" />
            <div className="flex gap-2 mb-4 flex-wrap">
              {CITIES.map(c => <Pill key={c} active={city === c} onClick={() => setCity(c)}>{c}</Pill>)}
            </div>
            <div className="space-y-2">
              {events.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CARD_STYLE} {...CARD_HOVER}>
                  <div className="text-center w-9 flex-shrink-0">
                    <p className="text-xl font-black leading-none text-white">{e.d}</p>
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-wide">{e.m}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/85 truncate group-hover:text-blue-300 transition-colors">{e.title}</p>
                    <p className="text-xs text-[#3d5070]">{e.venue} · {e.city}</p>
                  </div>
                  {e.sold
                    ? <span className="text-[11px] font-black text-red-400 bg-red-900/15 border border-red-800/25 px-2.5 py-1 rounded-full flex-shrink-0">Parduota</span>
                    : <button className="text-xs font-bold text-orange-400 hover:text-orange-300 flex-shrink-0">Bilietai →</button>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <SecHead label="💬 Gyvi pokalbiai" cta="Visi" />
            <div className="rounded-2xl overflow-hidden" style={CARD_STYLE}>
              <div className="divide-y divide-white/[0.04]">
                {SHOUTBOX.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 text-white/25 mt-0.5"
                      style={{ background: `hsl(${s.user.charCodeAt(0) * 19 % 360},28%,17%)` }}>
                      {s.user[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-blue-400">{s.user}</span>
                        <span className="text-[10px] text-[#1e2e42]">{s.ago}</span>
                      </div>
                      <p className="text-[13px] text-white/55 leading-relaxed">{s.msg}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2.5 p-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                <input type="text" placeholder="Rašyk žinutę…"
                  className="flex-1 h-8 rounded-full px-3.5 text-xs text-white/70 placeholder:text-[#2a3a50] focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }} />
                <button className="bg-[#1d4ed8] hover:bg-blue-500 text-white font-bold px-4 h-8 rounded-full text-xs transition-all flex-shrink-0">Siųsti</button>
              </div>
            </div>
          </section>
        </div>

        {/* ━━ ATLIKĖJŲ PRANEŠIMAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Atlikėjų pranešimai" cta="Visi pranešimai" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { artist: 'Silvester Belt', hue: 225, chip: 'Oficialus pranešimas', title: 'Oficiali Lietuvos daina „Eurovision 2026" pristatyta Bazelyje', ago: '2 val.' },
              { artist: 'Skamp', hue: 38, chip: 'Premjera', title: 'Skamp anunsavo pirmąjį albumą per 15 metų – „Sugrįžimas" gegužę', ago: '5 val.' },
              { artist: 'Granatas', hue: 155, chip: 'Renginys', title: 'Granatas paskelbė Vilniaus arenos koncertą spalio 18 d.', ago: '1 d.' },
              { artist: 'Andrius Mamontovas', hue: 280, chip: 'Interviu', title: 'Mamontovas: „Muzika visada randa kelią net tyliausiuose namuose"', ago: '2 d.' },
            ].map((p, i) => (
              <div key={i} className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CARD_STYLE} {...CARD_HOVER}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 text-white/25"
                  style={{ background: `hsl(${p.hue},35%,13%)` }}>
                  {p.artist[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: `hsl(${p.hue},40%,13%)`, color: `hsl(${p.hue},60%,65%)`, border: `1px solid hsl(${p.hue},40%,20%)` }}>
                      {p.chip}
                    </span>
                    <span className="text-[10px] text-[#2a3a50]">{p.ago}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-white/80 group-hover:text-blue-300 transition-colors leading-snug">{p.title}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ BENDRUOMENĖ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Bendruomenė" cta="Visos diskusijos" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMUNITY.map((c, i) => (
              <div key={i} className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CARD_STYLE} {...CARD_HOVER}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 text-white/25"
                  style={{ background: `hsl(${c.user.charCodeAt(0) * 17 % 360},30%,16%)` }}>
                  {c.user[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black text-[#3d5070] bg-white/[0.06] px-2 py-0.5 rounded-full">{c.type}</span>
                    <span className="text-[10px] text-[#2a3a50]">{c.ago}</span>
                  </div>
                  <p className="text-[13px] font-semibold text-white/80 group-hover:text-blue-300 transition-colors leading-snug">{c.title}</p>
                  <p className="text-[11px] text-[#3d5070] mt-1">{c.user} · {c.replies} atsakymų</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ ATRASK ATLIKĖJUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Atrask atlikėjus" cta="Visi atlikėjai" />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-5">
            {DISCOVER_ARTISTS.map((a, i) => (
              <div key={i} className="group cursor-pointer text-center relative">
                {a.new && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-black bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center z-10">N</span>
                )}
                <div className="aspect-square rounded-full mx-auto mb-3 relative overflow-hidden transition-transform duration-300 group-hover:scale-105 max-w-[80px]"
                  style={{ background: `hsl(${a.hue},40%,18%)`, boxShadow: `0 8px 24px hsl(${a.hue},40%,8%)` }}>
                  <div className="absolute inset-0 flex items-center justify-center text-3xl text-white/10 font-black">{a.name[0]}</div>
                </div>
                <p className="text-[13px] font-bold text-white/80 group-hover:text-blue-300 transition-colors truncate">{a.name}</p>
                <p className="text-[11px] text-[#3d5070] truncate">{a.genre}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ ATLIKĖJAMS CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <div className="rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-7 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.12) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(29,78,216,0.2)' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(29,78,216,0.08) 0%, transparent 55%)' }} />
            <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl bg-[#1d4ed8]/20 border border-[#1d4ed8]/25 flex items-center justify-center text-3xl">🎤</div>
            <div className="relative flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-black text-white mb-1.5">Atlikėjams</h3>
              <p className="text-[#4a6080] text-sm leading-relaxed max-w-lg">
                Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.
              </p>
            </div>
            <button className="relative flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-black px-8 py-3.5 rounded-full text-sm transition-all shadow-lg shadow-orange-900/40 hover:scale-[1.02] whitespace-nowrap">
              Pradėti nemokamai →
            </button>
          </div>
        </section>

      </div>

      {/* ━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: '#080b11' }}>
        <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="font-black text-xl mb-3"><span className="text-white">music</span><span className="text-orange-400">.lt</span></div>
              <p className="text-sm text-[#2a3a50] leading-relaxed">Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
            </div>
            {[
              { t: 'Platforma', l: ['Topai', 'Nauja muzika', 'Renginiai', 'Atlikėjai', 'Albumai'] },
              { t: 'Bendruomenė', l: ['Diskusijos', 'Blogai', 'Gyvi pokalbiai', 'Dienos daina'] },
              { t: 'Informacija', l: ['Apie mus', 'Atlikėjams', 'Reklama', 'Kontaktai', 'Privatumas'] },
            ].map(col => (
              <div key={col.t}>
                <h4 className="text-[10px] font-black uppercase tracking-[0.12em] text-[#1e2e42] mb-4">{col.t}</h4>
                <ul className="space-y-2.5">
                  {col.l.map(l => (
                    <li key={l}><a href="#" className="text-sm text-[#2a3a50] hover:text-white transition-colors">{l}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-xs text-[#1a2535]">© 2026 Music.lt — Visos teisės saugomos</span>
            <div className="flex gap-5">
              {['Facebook', 'Instagram', 'YouTube', 'Spotify'].map(sn => (
                <a key={sn} href="#" className="text-xs text-[#1a2535] hover:text-white transition-colors">{sn}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
