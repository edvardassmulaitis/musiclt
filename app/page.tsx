'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { HeaderAuth } from '@/components/HeaderAuth'
import Link from 'next/link'

// ── MOCK DATA ──────────────────────────────────────────────────────────────────

const SLIDES_LT = [
  {
    type: 'release',
    chip: '#1 Lietuvoje', chipBg: '#f97316',
    kicker: '3 savaitė iš eilės',
    artist: 'Silvester Belt', title: 'Bend The Lie',
    desc: 'Oficiali Lietuvos daina „Eurovision 2026" — jau viršuje visoje Europoje.',
    cta: 'Klausyti', ctaSecondary: 'Atlikėjo profilis',
    bg: 'linear-gradient(135deg, #0c1524 0%, #19103a 55%, #0c1524 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(99,102,241,0.4) 0%, transparent 55%)',
    cover: '#312e81',
  },
  {
    type: 'release',
    chip: 'Premjera', chipBg: '#2563eb',
    kicker: 'Albumas jau pasiekiamas',
    artist: 'Jurga', title: 'Vasaros Naktys',
    desc: 'Jau 5 savaitė TOP 10 — klausytojų mėgstamiausias šio sezono albumas.',
    cta: 'Klausyti albumą', ctaSecondary: 'Peržiūrėti',
    bg: 'linear-gradient(135deg, #071422 0%, #092a1e 55%, #071422 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(16,185,129,0.32) 0%, transparent 55%)',
    cover: '#064e3b',
  },
  {
    type: 'event',
    chip: 'Renginys', chipBg: '#059669',
    kicker: 'Vasario 22 d. • Kaunas',
    artist: 'Kęstutis Antanėlis', title: 'Žalgirio Arena',
    desc: 'Didžiausias šių metų koncertas Lietuvoje. Bilietų lieka nedaug.',
    cta: 'Pirkti bilietą', ctaSecondary: 'Daugiau info',
    bg: 'linear-gradient(135deg, #0a1422 0%, #1a1005 55%, #0a1422 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(245,158,11,0.3) 0%, transparent 55%)',
    cover: '#78350f',
  },
  {
    type: 'artist',
    chip: 'Atlikėjas', chipBg: '#7c3aed',
    kicker: '1.2M klausytojų šiandien',
    artist: 'Monika Liu', title: 'Lietuvos balso veidas',
    desc: 'Nuo „Eurovision" iki pasaulio scenų — sekite naujausias žinias.',
    cta: 'Peržiūrėti profilį', ctaSecondary: 'Klausyti',
    bg: 'linear-gradient(135deg, #0d0a1e 0%, #180a2e 55%, #0d0a1e 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(139,92,246,0.35) 0%, transparent 55%)',
    cover: '#3b0764',
  },
]

const SLIDES_WORLD = [
  {
    type: 'release',
    chip: '#1 Pasaulyje', chipBg: '#dc2626',
    kicker: '6 savaitė iš eilės',
    artist: 'Rose & Bruno Mars', title: 'APT.',
    desc: 'Hitas valdantis pasaulio charts — virusinė kūrinys iš Korėjos iki Europos.',
    cta: 'Klausyti', ctaSecondary: 'Daugiau',
    bg: 'linear-gradient(135deg, #180a0a 0%, #280a1e 55%, #180a0a 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(220,38,38,0.3) 0%, transparent 55%)',
    cover: '#7f1d1d',
  },
  {
    type: 'release',
    chip: 'Premjera', chipBg: '#0891b2',
    kicker: 'Naujausias singlas',
    artist: 'Billie Eilish', title: 'Birds of a Feather',
    desc: 'Iš albumo „Hit Me Hard and Soft" — jautrus ir galingas kūrinys.',
    cta: 'Klausyti', ctaSecondary: 'Profilis',
    bg: 'linear-gradient(135deg, #04101a 0%, #061828 55%, #04101a 100%)',
    glow: 'radial-gradient(ellipse at 25% 55%, rgba(8,145,178,0.3) 0%, transparent 55%)',
    cover: '#0c4a6e',
  },
]

const CHARTS_LT = [
  { pos: 1, artist: 'Monika Liu', title: 'Sentimentai', wks: 4, lt: true, trend: 'same' },
  { pos: 2, artist: 'Silvester Belt', title: 'Bend The Lie', wks: 2, lt: true, trend: 'up' },
  { pos: 3, artist: 'Jazzu', title: 'Kur Eisi', wks: 7, lt: true, trend: 'down' },
  { pos: 4, artist: 'Galerija', title: 'Naktis', wks: 3, lt: true, trend: 'up' },
  { pos: 5, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', wks: 1, lt: true, trend: 'new' },
  { pos: 6, artist: 'Andrius Mamontovas', title: 'Laikas', wks: 9, lt: true, trend: 'down' },
  { pos: 7, artist: 'Jurga', title: 'Vasaros Naktys', wks: 5, lt: true, trend: 'up' },
]

const CHARTS_WORLD = [
  { pos: 1, artist: 'Rose & Bruno Mars', title: 'APT.', lt: false, trend: 'same' },
  { pos: 2, artist: 'Lady Gaga', title: 'Disease', lt: false, trend: 'up' },
  { pos: 3, artist: 'Sabrina Carpenter', title: 'Espresso', lt: false, trend: 'down' },
  { pos: 4, artist: 'Billie Eilish', title: 'Birds of a Feather', lt: false, trend: 'up' },
  { pos: 5, artist: 'Chappell Roan', title: 'Good Luck, Babe!', lt: false, trend: 'new' },
  { pos: 6, artist: 'Kendrick Lamar', title: 'Luther', lt: false, trend: 'up' },
  { pos: 7, artist: 'SZA', title: 'Saturn', lt: false, trend: 'down' },
]

// genre: used for filtering both singles and albums
const SINGLES = [
  { artist: 'Monika Liu', title: 'Palauk', lt: true, hue: 280, genre: 'Pop' },
  { artist: 'Silvester Belt', title: 'Bend The Lie', lt: true, hue: 225, genre: 'Pop' },
  { artist: 'Dž. Džo', title: 'Vilniaus Vakaras', lt: true, hue: 200, genre: 'Hip-hop' },
  { artist: 'Andrius Mamontovas', title: 'Laikas', lt: true, hue: 155, genre: 'Rokas' },
  { artist: 'Saulės Kliošas', title: 'Ruduo', lt: true, hue: 320, genre: 'Folk' },
  { artist: 'Jazzu', title: 'Šviesa', lt: true, hue: 38, genre: 'Jazz' },
  { artist: 'Inculto', title: 'Grįžau', lt: true, hue: 5, genre: 'Rokas' },
  { artist: 'Skamp', title: 'Again', lt: true, hue: 260, genre: 'Pop' },
  { artist: 'Galerija', title: 'Aušra', lt: true, hue: 42, genre: 'Elektronika' },
  { artist: 'Dainava', title: 'Šaltinis', lt: true, hue: 190, genre: 'Folk' },
  { artist: 'Foje', title: 'Medžiai', lt: true, hue: 130, genre: 'Rokas' },
  { artist: 'G&G Sindikatas', title: 'Miestas', lt: true, hue: 25, genre: 'Hip-hop' },
  { artist: 'Birutė Mar', title: 'Jūra', lt: true, hue: 210, genre: 'Pop' },
  { artist: 'Sūduviai', title: 'Ąžuolas', lt: true, hue: 95, genre: 'Folk' },
]

// status: 'out' = išleista, 'soon' = greitai pasirodys
const ALBUMS = [
  { artist: 'Jurga', title: 'Vasaros Naktys', lt: true, hue: 155, tracks: 11, genre: 'Pop', status: 'out', date: 'Saus. 12' },
  { artist: 'Galerija', title: 'Naktis', lt: true, hue: 42, tracks: 8, genre: 'Elektronika', status: 'out', date: 'Saus. 20' },
  { artist: 'Dainava', title: 'Tamsoje', lt: true, hue: 260, tracks: 9, genre: 'Folk', status: 'out', date: 'Vas. 1' },
  { artist: 'Inculto', title: 'Retro', lt: true, hue: 5, tracks: 13, genre: 'Rokas', status: 'out', date: 'Vas. 8' },
  { artist: 'Skamp', title: 'Sugrįžimas', lt: true, hue: 180, tracks: 12, genre: 'Pop', status: 'out', date: 'Vas. 14' },
  { artist: 'Foje', title: 'Amžinai', lt: true, hue: 130, tracks: 10, genre: 'Rokas', status: 'out', date: 'Vas. 21' },
  { artist: 'Silvester Belt', title: 'European Tour', lt: true, hue: 225, tracks: 14, genre: 'Pop', status: 'soon', date: 'Kov. 7' },
  { artist: 'Monika Liu', title: 'Spalvos', lt: true, hue: 280, tracks: 9, genre: 'Pop', status: 'soon', date: 'Kov. 14' },
  { artist: 'Andrius Mamontovas', title: 'Akustinis', lt: true, hue: 155, tracks: 11, genre: 'Rokas', status: 'soon', date: 'Kov. 28' },
  { artist: 'Saulės Kliošas', title: 'Pavasaris', lt: true, hue: 320, tracks: 7, genre: 'Folk', status: 'soon', date: 'Bal. 4' },
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
]

const SHOUTBOX = [
  { user: 'muzikoslt', msg: 'Kas žino kada bus kitas Skamp koncertas?', ago: '2 min.' },
  { user: 'rockfanas', msg: 'Mamontovas 🔥 visiška legenda', ago: '5 min.' },
  { user: 'jazzlover', msg: 'Ieškau bilieto į Jurgą 03-01', ago: '12 min.' },
  { user: 'indie_lt', msg: 'Saulės Kliošo EP yra fire 🎶', ago: '18 min.' },
  { user: 'vertejas', msg: 'Padėkite išversti Arctic Monkeys', ago: '24 min.' },
]

const COMMUNITY = [
  { type: 'Diskusija', user: 'muzikoslt', title: 'Kaip vertinate naują Skamp albumą?', replies: 47, ago: '2 val.' },
  { type: 'Blogas', user: 'rockfanas', title: 'Mano top 10 LT albumų 2025 metais', replies: 12, ago: '5 val.' },
  { type: 'Recenzija', user: 'jazzlover', title: 'Jurga „Vasaros Naktys" — recenzija', replies: 8, ago: '1 d.' },
  { type: 'Diskusija', user: 'indie_lt', title: 'Geriausias LT indie albumas šiais metais?', replies: 23, ago: '1 d.' },
]

const EVENTS = [
  { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
  { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', venue: 'Tamsta Club', city: 'Vilnius', sold: false },
  { d: '01', m: 'KOV', title: 'Jurga & Orkestras', venue: 'LNFO', city: 'Vilnius', sold: false },
  { d: '15', m: 'KOV', title: 'Donatas Montvydas', venue: 'Compensa', city: 'Vilnius', sold: true },
  { d: '22', m: 'KOV', title: 'Andrius Mamontovas', venue: 'Forum Palace', city: 'Vilnius', sold: false },
]

const PRESS = [
  { artist: 'Silvester Belt', hue: 225, chip: 'Oficialus pranešimas', title: 'Oficiali Lietuvos daina „Eurovision 2026" pristatyta Bazelyje', ago: '2 val.' },
  { artist: 'Skamp', hue: 38, chip: 'Premjera', title: 'Skamp anunsavo pirmąjį albumą per 15 metų — „Sugrįžimas"', ago: '5 val.' },
  { artist: 'Granatas', hue: 155, chip: 'Renginys', title: 'Granatas paskelbė Vilniaus arenos koncertą spalio 18 d.', ago: '1 d.' },
  { artist: 'Andrius Mamontovas', hue: 280, chip: 'Interviu', title: 'Mamontovas: „Muzika visada randa kelią net tyliausiuose namuose"', ago: '2 d.' },
]

const DISCOVER = [
  { name: 'Monika Liu', genre: 'Pop / Soul', hue: 280, isNew: false },
  { name: 'Dž. Džo', genre: 'Hip-hop', hue: 30, isNew: true },
  { name: 'Saulės Kliošas', genre: 'Indie', hue: 320, isNew: true },
  { name: 'Galerija', genre: 'Elektronika', hue: 155, isNew: false },
  { name: 'Jazzu', genre: 'R&B / Soul', hue: 200, isNew: false },
  { name: 'Skamp', genre: 'Pop', hue: 180, isNew: false },
]

const CITIES = ['Visi', 'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai']
const GENRES = ['Visi', 'Pop', 'Rokas', 'Hip-hop', 'Elektronika', 'Folk', 'Jazz']
const NAV = ['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė']

// ── ATOMS ──────────────────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap select-none ${
        active ? 'bg-[#1d4ed8] text-white shadow-md shadow-blue-900/50'
               : 'text-[#7a90b0] border border-white/[0.08] hover:text-[#e2e8f0] hover:border-white/[0.16]'}`}>
      {label}
    </button>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span className="text-emerald-400 font-black text-xs">↑</span>
  if (t === 'down') return <span className="text-red-400 font-black text-xs">↓</span>
  if (t === 'new') return <span className="text-[9px] font-black text-amber-300 bg-amber-400/10 px-1 py-0.5 rounded">N</span>
  return <span className="text-[#2a3a50] text-xs">—</span>
}

function PlayCircle({ sz = 10 }: { sz?: number }) {
  return (
    <div className={`w-${sz} h-${sz} rounded-full bg-orange-500 hover:bg-orange-400 flex items-center justify-center shadow-xl transition-all hover:scale-105 cursor-pointer`}>
      <span className="text-white ml-0.5" style={{ fontSize: sz <= 8 ? 12 : sz <= 10 ? 14 : 18 }}>▶</span>
    </div>
  )
}

function SecHead({ label, cta }: { label: React.ReactNode; cta?: string }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-[19px] font-black text-[#f2f4f8] tracking-tight">{label}</h2>
      {cta && <a href="#" className="text-sm text-[#4a6fa5] hover:text-[#93b4e0] font-semibold transition-colors">{cta} →</a>}
    </div>
  )
}

// inline card styles
const CS = { background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.075)' }
const CH = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)' },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.075)' },
}

// ── MAIN ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [lens, setLens] = useState<'lt' | 'world' | 'all'>('lt')
  const [idx, setIdx] = useState(0)
  const [chartTab, setChartTab] = useState<'lt' | 'world'>('lt')
  const [genre, setGenre] = useState('Visi')
  const [city, setCity] = useState('Visi')
  const [rx, setRx] = useState(SOTD.rx)
  const [voted, setVoted] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const slides = lens === 'world' ? SLIDES_WORLD : SLIDES_LT
  const chartData = lens === 'world' || chartTab === 'world' ? CHARTS_WORLD : CHARTS_LT

  const goTo = useCallback((i: number, len: number) => {
    setIdx(((i % len) + len) % len)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  useEffect(() => { setIdx(0) }, [lens])

  useEffect(() => {
    timerRef.current = setTimeout(() => setIdx(p => (p + 1) % slides.length), 7000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [idx, slides.length])

  const s = slides[Math.min(idx, slides.length - 1)]
  const events = city === 'Visi' ? EVENTS : EVENTS.filter(e => e.city === city)

  return (
    <div className="min-h-screen text-[#f2f4f8]" style={{ background: '#0d1117' }}>

      {/* ━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="sticky top-0 z-50" style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(24px)' }}>

        {/* ── Row 1: Logo + Search + Lens + Auth ── */}
        <div className="max-w-[1360px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-6">
          <Link href="/" className="flex-shrink-0">
            <span className="font-black text-[22px] tracking-tight" style={{ color: '#f2f4f8' }}>music</span>
            <span className="font-black text-[22px] tracking-tight text-orange-400">.lt</span>
          </Link>

          {/* Search with icon button */}
          <div className="flex-1 hidden md:flex items-center rounded-full overflow-hidden transition-all"
            style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
            onFocus={() => {}} >
            <input type="text" placeholder="Ieškok atlikėjų, albumų, dainų, renginių…"
              className="flex-1 h-9 px-4 text-sm bg-transparent focus:outline-none"
              style={{ color: '#c8d8f0' }} />
            <button className="flex-shrink-0 w-9 h-9 flex items-center justify-center transition-colors hover:text-white"
              style={{ color: '#6a88b0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          </div>

          {/* Lens switch */}
          <div className="flex-shrink-0 flex items-center rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {([
              ['lt',    '🇱🇹 LT'],
              ['world', 'Pasaulis'],
              ['all',   'Visi'],
            ] as const).map(([v, l]) => (
              <button key={v} onClick={() => setLens(v)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold tracking-wide transition-all ${
                  lens === v ? 'bg-[#1d4ed8] text-white shadow-md' : 'hover:text-white'
                }`}
                style={{ color: lens === v ? 'white' : '#8aa8cc' }}>
                {l}
              </button>
            ))}
          </div>

          {/* Auth — single button, context-aware */}
          <button className="flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-2 rounded-full text-[13px] transition-all shadow-md shadow-orange-900/30 hover:scale-[1.02] whitespace-nowrap">
            Prisijungti
          </button>
        </div>

        {/* ── Row 2: Navigation ── */}
        <div className="border-t border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="max-w-[1360px] mx-auto px-5 lg:px-8 h-9 flex items-center gap-1">
            {NAV.map(n => (
              <a key={n} href="#"
                className="px-3.5 py-1 text-[12px] font-semibold rounded-md transition-all"
                style={{ color: '#8aa8cc' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#e2eaf8'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#8aa8cc'; e.currentTarget.style.background = 'transparent' }}>
                {n}
              </a>
            ))}
            <div className="ml-auto flex items-center gap-4">
              {['Atlikėjams', 'Reklama'].map(l => (
                <a key={l} href="#" className="text-[11px] font-semibold transition-colors"
                  style={{ color: '#4a6580' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8aa8cc')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#4a6580')}>
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>

      </header>

      {/* ━━ HERO + TOPAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden" style={{ background: s.bg, transition: 'background 0.9s ease' }}>
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none transition-all duration-700" style={{ background: s.glow }} />
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-[0.022] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '52px 52px' }} />

        <div className="relative max-w-[1360px] mx-auto px-5 lg:px-8">
          <div className="flex flex-col lg:flex-row gap-0 items-stretch">

            {/* ── HERO (65%) ── */}
            <div className="flex-1 py-10 lg:py-12 lg:pr-8 flex flex-col sm:flex-row items-center gap-8 sm:gap-10">
              {/* Cover / Video embed mock */}
              <div className="relative group cursor-pointer flex-shrink-0">
                <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-2xl overflow-hidden shadow-2xl transition-transform duration-300 group-hover:scale-[1.02] select-none relative"
                  style={{ background: s.cover, boxShadow: `0 24px 64px ${s.cover}88, 0 6px 20px rgba(0,0,0,0.8)` }}>
                  {/* Simulated video/cover art */}
                  <div className="absolute inset-0 flex items-center justify-center text-7xl" style={{ color: 'rgba(255,255,255,0.08)' }}>♪</div>
                  {/* Spotify-style bottom bar */}
                  <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 flex items-center gap-2"
                    style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.75))' }}>
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <div className="h-full w-2/5 rounded-full bg-white" />
                    </div>
                    <span className="text-[10px] font-bold text-white/60">1:47</span>
                  </div>
                </div>
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl"
                  style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-transform hover:scale-105"
                    style={{ background: 'rgba(249,115,22,0.95)', backdropFilter: 'blur(4px)' }}>
                    <span className="text-white text-xl ml-0.5">▶</span>
                  </div>
                </div>
              </div>

              {/* Text — dark overlay for readability */}
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start mb-4">
                  <span className="px-3 py-1 rounded-full text-xs font-black text-white" style={{ background: s.chipBg }}>{s.chip}</span>
                  <span className="text-sm font-medium" style={{ color: 'rgba(210,220,240,0.55)' }}>{s.kicker}</span>
                </div>
                {/* Artist name — heavy weight, near-white */}
                <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-black leading-[1.05] tracking-tight mb-1.5" style={{ color: '#f2f4f8', textShadow: '0 2px 16px rgba(0,0,0,0.6)' }}>
                  {s.artist}
                </h1>
                <p className="text-xl sm:text-2xl font-light mb-5 tracking-wide" style={{ color: 'rgba(200,215,240,0.55)' }}>{s.title}</p>
                {/* Desc on dark pill background for readability */}
                <p className="text-sm leading-relaxed mb-7 max-w-md"
                  style={{ color: 'rgba(210,225,248,0.75)' }}>
                  {s.desc}
                </p>
                <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
                  <button className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-400 text-white font-black px-6 py-3 rounded-full text-sm transition-all shadow-lg shadow-orange-900/50 hover:scale-[1.02]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    {s.cta}
                  </button>
                  <button className="flex items-center gap-2 font-semibold px-5 py-3 rounded-full text-sm transition-all border hover:scale-[1.01]"
                    style={{ color: 'rgba(200,215,240,0.6)', borderColor: 'rgba(255,255,255,0.14)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    {s.ctaSecondary}
                  </button>
                </div>
              </div>

              {/* Nav arrows */}
              <div className="hidden sm:flex flex-col gap-2 flex-shrink-0">
                {[-1, 1].map(dir => (
                  <button key={dir} onClick={() => goTo(idx + dir, slides.length)}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
                    style={{ color: 'rgba(200,215,240,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {dir === -1 ? '←' : '→'}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertical divider */}
            <div className="hidden lg:block w-px my-8 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />

            {/* ── TOPAI SIDEBAR (35%) ── */}
            <div className="lg:w-[350px] xl:w-[380px] flex-shrink-0 py-8 lg:pl-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                  {[{ k: 'lt', l: '🇱🇹 LT Top 30' }, { k: 'world', l: '🌍 Top 40' }].map(tab => (
                    <button key={tab.k} onClick={() => setChartTab(tab.k as 'lt' | 'world')}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${chartTab === tab.k ? 'bg-[#1d4ed8] text-white' : 'text-[#4a6080] hover:text-[#c8d8f0]'}`}>
                      {tab.l}
                    </button>
                  ))}
                </div>
                <a href="#" className="text-xs text-[#4a6fa5] hover:text-[#93b4e0] font-bold transition-colors">Visi →</a>
              </div>

              <div className="flex-1">
                {chartData.map((t, i) => (
                  <div key={t.pos}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    style={{ borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span className={`w-5 text-center text-sm font-black flex-shrink-0 ${t.pos <= 3 ? 'text-orange-400' : 'text-[#2a3a50]'}`}>{t.pos}</span>
                    <div className="w-4 flex items-center justify-center flex-shrink-0"><TrendIcon t={t.trend} /></div>
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px]" style={{ background: `hsl(${t.pos * 43},30%,14%)`, color: 'rgba(255,255,255,0.12)' }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate group-hover:text-blue-300 transition-colors" style={{ color: '#eef2fa' }}>{t.title}</span>
                        {t.lt && chartTab === 'world' && <span className="text-[10px] opacity-60 flex-shrink-0">🇱🇹</span>}
                      </div>
                      <span className="text-[11px] truncate block" style={{ color: '#7a90b0' }}>{t.artist}</span>
                    </div>
                    {'wks' in t && typeof (t as {wks?: number}).wks === 'number' && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#1e2e42' }}>{(t as {wks: number}).wks}w</span>
                    )}
                  </div>
                ))}
              </div>

              <button className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-white/[0.04]"
                style={{ border: '1px solid rgba(255,255,255,0.08)', color: '#4a6fa5' }}>
                Žiūrėti visą topą →
              </button>
            </div>
          </div>

          {/* Slide dots */}
          <div className="absolute bottom-4 left-[calc(50%*65/100)] -translate-x-1/2 flex gap-2 items-center hidden lg:flex">
            {slides.map((_, i) => (
              <button key={i} onClick={() => goTo(i, slides.length)}
                className={`rounded-full transition-all duration-300 ${i === idx ? 'w-6 h-1.5 bg-orange-400' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'}`} />
            ))}
          </div>
        </div>
      </section>

      {/* ━━ MAIN CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="max-w-[1360px] mx-auto px-5 lg:px-8 py-12 space-y-16">

        {/* ━━ NAUJOS DAINOS + NAUJI ALBUMAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <div className="flex flex-col lg:flex-row gap-8">

            {/* ── Left sidebar: genre filter ── */}
            <div className="lg:w-32 flex-shrink-0">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-2" style={{ color: '#3d5878' }}>Stilius</p>
              <div className="flex lg:flex-col gap-1.5 flex-wrap">
                {GENRES.map(g => (
                  <button key={g}
                    onClick={() => setGenre(g)}
                    className="px-3 py-2 rounded-lg text-xs font-bold transition-all text-left"
                    style={{
                      color: genre === g ? '#f2f4f8' : '#5a7898',
                      background: genre === g ? 'rgba(29,78,216,0.22)' : 'transparent',
                      border: genre === g ? '1px solid rgba(29,78,216,0.28)' : '1px solid transparent',
                    }}>
                    {g}
                  </button>
                ))}
                {/* Man patinka — below genres, clearly separate */}
                <div className="hidden lg:block w-full h-px mt-1 mb-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <button
                  onClick={() => setGenre('forYou')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all text-left"
                  style={{
                    color: genre === 'forYou' ? '#fb923c' : '#5a7898',
                    background: genre === 'forYou' ? 'rgba(249,115,22,0.12)' : 'transparent',
                    border: genre === 'forYou' ? '1px solid rgba(249,115,22,0.22)' : '1px solid transparent',
                  }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                  Man patinka
                </button>
              </div>
            </div>

            {/* ── Right: both rows ── */}
            <div className="flex-1 min-w-0 space-y-8">

              {/* ── Naujos dainos — compact inline cards ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[19px] font-black tracking-tight" style={{ color: '#f2f4f8' }}>Naujos dainos</h2>
                  <a href="#" className="text-sm font-semibold transition-colors" style={{ color: '#4a6fa5' }}>Visos →</a>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                  {SINGLES
                    .filter(r => genre === 'Visi' || genre === 'forYou' || r.genre === genre)
                    .map((r, i) => (
                    <div key={i} className="group cursor-pointer flex-shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all w-[210px]" style={CS} {...CH}>
                      {/* Small square cover */}
                      <div className="flex-shrink-0 w-11 h-11 rounded-lg relative overflow-hidden"
                        style={{ background: `hsl(${r.hue},38%,18%)` }}>
                        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 30%, hsl(${r.hue},50%,30%) 0%, transparent 65%)` }} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                          style={{ background: 'rgba(0,0,0,0.55)' }}>
                          <span className="text-white text-xs ml-0.5">▶</span>
                        </div>
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] font-bold truncate leading-tight group-hover:text-blue-300 transition-colors" style={{ color: '#eef2fa' }}>{r.title}</h4>
                        <p className="text-[11px] truncate font-medium mt-0.5" style={{ color: '#7a93b5' }}>{r.artist}</p>
                      </div>
                      {genre === 'forYou' && <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'rgba(249,115,22,0.6)' }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Nauji albumai — same compact inline style, split by status ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[19px] font-black tracking-tight" style={{ color: '#f2f4f8' }}>Nauji albumai</h2>
                  <a href="#" className="text-sm font-semibold transition-colors" style={{ color: '#4a6fa5' }}>Visi →</a>
                </div>

                {/* Neseniai išleista */}
                {(() => {
                  const out = ALBUMS.filter(a => a.status === 'out' && (genre === 'Visi' || genre === 'forYou' || a.genre === genre))
                  if (!out.length) return null
                  return (
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: '#3d5878' }}>Neseniai išleista</p>
                      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {out.map((r, i) => (
                          <div key={i} className="group cursor-pointer flex-shrink-0 flex items-center gap-3 px-3 py-3 rounded-xl transition-all w-[240px]" style={CS} {...CH}>
                            <div className="flex-shrink-0 w-14 h-14 rounded-xl relative overflow-hidden"
                              style={{ background: `hsl(${r.hue},42%,18%)`, boxShadow: `0 4px 14px hsl(${r.hue},42%,6%)` }}>
                              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 28% 28%, hsl(${r.hue},55%,34%) 0%, transparent 60%)` }} />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                style={{ background: 'rgba(0,0,0,0.5)' }}>
                                <span className="text-white text-xs ml-0.5">▶</span>
                              </div>
                              {r.lt && <span className="absolute top-0.5 left-0.5 text-[9px] opacity-60">🇱🇹</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-bold truncate leading-tight group-hover:text-blue-300 transition-colors" style={{ color: '#eef2fa' }}>{r.title}</h4>
                              <p className="text-[12px] truncate font-medium mt-0.5" style={{ color: '#7a93b5' }}>{r.artist}</p>
                              <p className="text-[11px] font-medium mt-1" style={{ color: '#4a6580' }}>{r.date}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Greitai pasirodys */}
                {(() => {
                  const soon = ALBUMS.filter(a => a.status === 'soon' && (genre === 'Visi' || genre === 'forYou' || a.genre === genre))
                  if (!soon.length) return null
                  return (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: '#3d5878' }}>Greitai pasirodys</p>
                      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {soon.map((r, i) => (
                          <div key={i} className="group cursor-pointer flex-shrink-0 flex items-center gap-3 px-3 py-3 rounded-xl transition-all w-[240px]"
                            style={{ background: 'rgba(255,255,255,0.018)', border: '1px solid rgba(255,255,255,0.055)' }} {...CH}>
                            <div className="flex-shrink-0 w-14 h-14 rounded-xl relative overflow-hidden"
                              style={{ background: `hsl(${r.hue},28%,13%)` }}>
                              <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 28% 28%, hsl(${r.hue},35%,20%) 0%, transparent 55%)` }} />
                              <div className="absolute inset-0" style={{ background: 'rgba(13,17,23,0.4)' }} />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>⏳</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[13px] font-bold truncate leading-tight" style={{ color: '#c8d8f0' }}>{r.title}</h4>
                              <p className="text-[12px] truncate font-medium mt-0.5" style={{ color: '#5a7898' }}>{r.artist}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>GREITAI</span>
                                <span className="text-[11px] font-medium" style={{ color: '#4a6580' }}>{r.date}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>
        </section>

        {/* ━━ DIENOS DAINA + POKALBIAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">

            {/* ── Dienos daina: kompaktiškas blokas su viskuo ── */}
            <div>
              <SecHead label="🎵 Dienos daina" />
              <div className="rounded-2xl overflow-hidden relative"
                style={{ background: 'linear-gradient(160deg, rgba(29,78,216,0.22) 0%, rgba(13,17,23,0.98) 100%)', border: '1px solid rgba(29,78,216,0.2)' }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 5% 85%, rgba(29,78,216,0.1) 0%, transparent 50%)' }} />

                {/* Main song info */}
                <div className="relative flex items-center gap-4 p-5 border-b border-white/[0.06]">
                  <div className="relative group flex-shrink-0 cursor-pointer">
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl"
                      style={{ background: `hsl(${SOTD.hue},45%,14%)`, boxShadow: `0 8px 24px hsl(${SOTD.hue},45%,6%)` }}>🎵</div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                      style={{ background: 'rgba(0,0,0,0.45)' }}>
                      <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center"><span className="text-white text-sm ml-0.5">▶</span></div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] mb-0.5" style={{ color: '#3d5878' }}>Siūlo <span className="text-blue-400 font-bold">{SOTD.by}</span></p>
                    <h3 className="font-black text-lg leading-tight" style={{ color: '#f2f4f8' }}>{SOTD.artist}</h3>
                    <p className="text-sm" style={{ color: 'rgba(200,215,240,0.55)' }}>{SOTD.title}</p>
                  </div>
                  <button className="flex-shrink-0 flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white font-black px-4 py-2 rounded-full text-xs transition-all shadow-md">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    Klausyti
                  </button>
                </div>

                {/* Reactions */}
                <div className="relative flex items-center gap-2 px-5 py-3 border-b border-white/[0.05]">
                  {([['fire', '🔥', rx.fire], ['heart', '❤️', rx.heart], ['star', '⭐', rx.star]] as const).map(([k, e, c]) => (
                    <button key={k} onClick={() => setRx(r => ({ ...r, [k]: r[k as keyof typeof r] + 1 }))}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all hover:scale-105 active:scale-95"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {e} <span style={{ color: '#dde8f8' }}>{c}</span>
                    </button>
                  ))}
                  <p className="ml-auto text-[11px]" style={{ color: '#2a3a50' }}>Vakar: {SOTD.yesterday}</p>
                </div>

                {/* Voting list */}
                <div className="relative">
                  <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: '#2a3a50' }}>Rytdienos balsavimas</p>
                    <a href="#" className="text-[10px] font-bold" style={{ color: '#4a6fa5' }}>+ Siūlyti</a>
                  </div>
                  <div className="divide-y divide-white/[0.04]">
                    {SOTD_CANDIDATES.slice(0, 6).map((c, i) => (
                      <div key={i} className="flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <span className="font-black text-xs w-4 text-center flex-shrink-0" style={{ color: '#1e2e42' }}>#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate" style={{ color: '#dde8f8' }}>{c.artist}</p>
                          <p className="text-[10px] truncate" style={{ color: '#3d5878' }}>{c.title}</p>
                        </div>
                        <span className="text-xs font-black w-6 text-right flex-shrink-0" style={{ color: 'rgba(200,215,240,0.4)' }}>{voted === i ? c.votes + 1 : c.votes}</span>
                        <button onClick={() => voted === null && setVoted(i)} disabled={voted !== null}
                          className={`text-[11px] font-black px-2.5 py-1 rounded-full flex-shrink-0 transition-all ${
                            voted === i ? 'text-emerald-400 bg-emerald-900/20 border border-emerald-700/25'
                            : voted !== null ? 'opacity-25 border border-white/5'
                            : 'text-blue-400 border border-blue-800/30 hover:bg-blue-900/15'}`}>
                          {voted === i ? '✓' : 'Balsuoti'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Gyvi pokalbiai ── */}
            <div>
              <SecHead label="💬 Gyvi pokalbiai" cta="Visi" />
              <div className="rounded-2xl overflow-hidden h-[calc(100%-3rem)]" style={CS}>
                <div>
                  {SHOUTBOX.map((s, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors"
                      style={{ borderBottom: i < SHOUTBOX.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 mt-0.5"
                        style={{ background: `hsl(${s.user.charCodeAt(0) * 19 % 360},28%,16%)`, color: 'rgba(255,255,255,0.25)' }}>
                        {s.user[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-blue-400">{s.user}</span>
                          <span className="text-[10px]" style={{ color: '#1e2e42' }}>{s.ago}</span>
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(200,218,245,0.65)' }}>{s.msg}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2.5 p-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                  <input type="text" placeholder="Rašyk žinutę… (reikia prisijungti)"
                    className="flex-1 h-8 rounded-full px-3.5 text-xs focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)', color: '#c8d8f0' }} />
                  <button className="bg-[#1d4ed8] hover:bg-blue-500 text-white font-bold px-4 h-8 rounded-full text-xs transition-all flex-shrink-0">Siųsti</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ━━ BENDRUOMENĖ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Bendruomenė" cta="Visos diskusijos" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMMUNITY.map((c, i) => (
              <div key={i} className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CS} {...CH}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: `hsl(${c.user.charCodeAt(0) * 17 % 360},28%,15%)`, color: 'rgba(255,255,255,0.22)' }}>
                  {c.user[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', color: '#4a6080' }}>{c.type}</span>
                    <span className="text-[10px]" style={{ color: '#2a3a50' }}>{c.ago}</span>
                  </div>
                  <p className="text-[13px] font-semibold group-hover:text-blue-300 transition-colors leading-snug" style={{ color: '#c8d8f0' }}>{c.title}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#3d5878' }}>{c.user} · {c.replies} ats.</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ RENGINIAI + PRANEŠIMAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          <section>
            <SecHead label="Renginiai" cta="Visi renginiai" />
            <div className="flex gap-2 mb-4 flex-wrap">
              {CITIES.map(c => <Pill key={c} label={c} active={city === c} onClick={() => setCity(c)} />)}
            </div>
            <div className="space-y-2">
              {events.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CS} {...CH}>
                  <div className="text-center w-9 flex-shrink-0">
                    <p className="text-xl font-black leading-none" style={{ color: '#f2f4f8' }}>{e.d}</p>
                    <p className="text-[9px] font-black uppercase tracking-wide text-orange-400">{e.m}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate group-hover:text-blue-300 transition-colors" style={{ color: '#dde8f8' }}>{e.title}</p>
                    <p className="text-xs" style={{ color: '#3d5878' }}>{e.venue} · {e.city}</p>
                  </div>
                  {e.sold
                    ? <span className="text-[11px] font-black text-red-400 px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(127,29,29,0.3)' }}>Parduota</span>
                    : <button className="text-xs font-bold text-orange-400 hover:text-orange-300 flex-shrink-0">Bilietai →</button>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <SecHead label="Atlikėjų pranešimai" cta="Visi pranešimai" />
            <div className="space-y-2">
              {PRESS.map((p, i) => (
                <div key={i} className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all" style={CS} {...CH}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0"
                    style={{ background: `hsl(${p.hue},35%,12%)`, color: 'rgba(255,255,255,0.22)' }}>
                    {p.artist[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: `hsl(${p.hue},40%,12%)`, color: `hsl(${p.hue},60%,62%)`, border: `1px solid hsl(${p.hue},40%,19%)` }}>
                        {p.chip}
                      </span>
                      <span className="text-[10px]" style={{ color: '#2a3a50' }}>{p.ago}</span>
                    </div>
                    <p className="text-[13px] font-semibold group-hover:text-blue-300 transition-colors leading-snug" style={{ color: '#c8d8f0' }}>{p.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ━━ ATRASK ATLIKĖJUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Atrask atlikėjus" cta="Visi atlikėjai" />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-5">
            {DISCOVER.map((a, i) => (
              <div key={i} className="group cursor-pointer text-center relative">
                {a.isNew && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-black bg-orange-500 text-white w-5 h-5 rounded-full flex items-center justify-center z-10">N</span>
                )}
                <div className="aspect-square rounded-full mx-auto mb-3 overflow-hidden transition-transform duration-300 group-hover:scale-105 max-w-[80px] flex items-center justify-center"
                  style={{ background: `hsl(${a.hue},40%,16%)`, boxShadow: `0 8px 20px hsl(${a.hue},40%,6%)` }}>
                  <span className="text-3xl font-black" style={{ color: 'rgba(255,255,255,0.1)' }}>{a.name[0]}</span>
                </div>
                <p className="text-[13px] font-bold group-hover:text-blue-300 transition-colors truncate" style={{ color: '#c8d8f0' }}>{a.name}</p>
                <p className="text-[11px] truncate" style={{ color: '#3d5878' }}>{a.genre}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ ATLIKĖJAMS CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <div className="rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-7 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.11) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(29,78,216,0.18)' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(29,78,216,0.07) 0%, transparent 55%)' }} />
            <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'rgba(29,78,216,0.18)', border: '1px solid rgba(29,78,216,0.25)' }}>🎤</div>
            <div className="relative flex-1 text-center sm:text-left">
              <h3 className="text-[22px] font-black mb-1.5" style={{ color: '#f2f4f8' }}>Atlikėjams</h3>
              <p className="text-sm leading-relaxed max-w-lg" style={{ color: '#4a6080' }}>
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
              <div className="font-black text-xl mb-3"><span style={{ color: '#f2f4f8' }}>music</span><span className="text-orange-400">.lt</span></div>
              <p className="text-sm leading-relaxed" style={{ color: '#2a3a50' }}>Lietuvos muzikos ekosistemos platforma nuo 1999 m.</p>
            </div>
            {[
              { t: 'Platforma', l: ['Topai', 'Nauja muzika', 'Renginiai', 'Atlikėjai', 'Albumai'] },
              { t: 'Bendruomenė', l: ['Diskusijos', 'Blogai', 'Gyvi pokalbiai', 'Dienos daina'] },
              { t: 'Informacija', l: ['Apie mus', 'Atlikėjams', 'Reklama', 'Kontaktai', 'Privatumas'] },
            ].map(col => (
              <div key={col.t}>
                <h4 className="text-[10px] font-black uppercase tracking-[0.12em] mb-4" style={{ color: '#1e2e42' }}>{col.t}</h4>
                <ul className="space-y-2.5">
                  {col.l.map(l => <li key={l}><a href="#" className="text-sm transition-colors hover:text-white" style={{ color: '#2a3a50' }}>{l}</a></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-8" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-xs" style={{ color: '#1a2535' }}>© 2026 Music.lt — Visos teisės saugomos</span>
            <div className="flex gap-5">
              {['Facebook', 'Instagram', 'YouTube', 'Spotify'].map(sn => (
                <a key={sn} href="#" className="text-xs transition-colors hover:text-white" style={{ color: '#1a2535' }}>{sn}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
