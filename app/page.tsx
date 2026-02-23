'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { HeaderAuth } from '@/components/HeaderAuth'
import Link from 'next/link'

// ── MOCK DATA ──────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    chip: '#1 Lietuvoje', chipBg: '#f97316',
    kicker: '3 savaitė iš eilės',
    artist: 'Silvester Belt',
    title: 'Bend The Lie',
    desc: 'Oficiali Lietuvos daina „Eurovision 2026" — jau viršuje visoje Europoje.',
    cta: 'Klausyti', ctaSecondary: 'Atlikėjo profilis',
    bg: 'linear-gradient(135deg, #0f1729 0%, #1e1035 50%, #0f1729 100%)',
    glow: 'radial-gradient(ellipse at 35% 60%, rgba(99,102,241,0.35) 0%, transparent 60%)',
    cover: '#3730a3',
  },
  {
    chip: 'Premjera', chipBg: '#2563eb',
    kicker: 'Albumas jau pasiekiamas',
    artist: 'Jurga',
    title: 'Vasaros Naktys',
    desc: 'Jau 5 savaitė TOP 10 — klausytojų mėgstamiausias šio sezono albumas.',
    cta: 'Klausyti albumą', ctaSecondary: 'Peržiūrėti profilį',
    bg: 'linear-gradient(135deg, #0a1628 0%, #0c2a1e 50%, #0a1628 100%)',
    glow: 'radial-gradient(ellipse at 35% 60%, rgba(16,185,129,0.28) 0%, transparent 60%)',
    cover: '#065f46',
  },
  {
    chip: 'Renginys', chipBg: '#059669',
    kicker: 'Vasario 22 d. • Kaunas',
    artist: 'Kęstutis Antanėlis',
    title: 'Žalgirio Arena',
    desc: 'Didžiausias šių metų koncertas Lietuvoje. Bilietų lieka nedaug.',
    cta: 'Pirkti bilietą', ctaSecondary: 'Sužinoti daugiau',
    bg: 'linear-gradient(135deg, #0a1628 0%, #1a1206 50%, #0a1628 100%)',
    glow: 'radial-gradient(ellipse at 35% 60%, rgba(245,158,11,0.28) 0%, transparent 60%)',
    cover: '#92400e',
  },
  {
    chip: 'Atlikėjas', chipBg: '#7c3aed',
    kicker: 'Šiandien 1.2M klausytojų',
    artist: 'Monika Liu',
    title: 'Lietuvos balso veidas',
    desc: 'Nuo „Eurovision" iki pasaulio scenų — sekite paskutines naujienas.',
    cta: 'Peržiūrėti profilį', ctaSecondary: 'Klausyti dainų',
    bg: 'linear-gradient(135deg, #0f0a1e 0%, #1a0a2e 50%, #0f0a1e 100%)',
    glow: 'radial-gradient(ellipse at 35% 60%, rgba(139,92,246,0.32) 0%, transparent 60%)',
    cover: '#4c1d95',
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
  { pos: 8, artist: 'Dainava', title: 'Tamsoje', wks: 2, lt: true, trend: 'down' },
  { pos: 9, artist: 'Saulės Kliošas', title: 'Rugsėjis', wks: 6, lt: true, trend: 'up' },
  { pos: 10, artist: 'Inculto', title: 'Retro', wks: 4, lt: true, trend: 'down' },
]

const CHARTS_VOTE = [
  { pos: 1, artist: 'Foje', title: 'Žmogus Kuris Nemoka Šokti', votes: 312, lt: true, trend: 'up' },
  { pos: 2, artist: 'Monika Liu', title: 'Sentimentai', votes: 287, lt: true, trend: 'down' },
  { pos: 3, artist: 'Andrius Mamontovas', title: 'Laikas', votes: 241, lt: true, trend: 'same' },
  { pos: 4, artist: 'Galerija', title: 'Naktis', votes: 198, lt: true, trend: 'up' },
  { pos: 5, artist: 'Jazzu', title: 'Kur Eisi', votes: 176, lt: true, trend: 'down' },
  { pos: 6, artist: 'Jurga', title: 'Vasaros Naktys', votes: 154, lt: true, trend: 'up' },
  { pos: 7, artist: 'Skamp', title: 'Come Back To Me', votes: 143, lt: true, trend: 'down' },
  { pos: 8, artist: 'Dž. Džo', title: 'Vilniaus Vakaras', votes: 121, lt: true, trend: 'new' },
  { pos: 9, artist: 'Saulės Kliošas', title: 'Rugsėjis', votes: 98, lt: true, trend: 'down' },
  { pos: 10, artist: 'Dainava', title: 'Tamsoje', votes: 87, lt: true, trend: 'same' },
]

const RELEASES = [
  { type: 'Singl', artist: 'Monika Liu', title: 'Palauk', lt: true, hue: 280 },
  { type: 'Albumas', artist: 'Jurga', title: 'Vasaros Naktys', lt: true, hue: 155 },
  { type: 'EP', artist: 'Saulės Kliošas', title: 'Rugsėjis', lt: true, hue: 320 },
  { type: 'Singl', artist: 'Silvester Belt', title: 'Bend The Lie', lt: true, hue: 225 },
  { type: 'Albumas', artist: 'Galerija', title: 'Naktis', lt: true, hue: 38 },
  { type: 'Singl', artist: 'Dž. Džo', title: 'Vilniaus Vakaras', lt: true, hue: 200 },
  { type: 'EP', artist: 'Dainava', title: 'Tamsoje', lt: true, hue: 260 },
  { type: 'Albumas', artist: 'Inculto', title: 'Retro', lt: true, hue: 5 },
]

const SOTD = {
  artist: 'Foje', title: 'Žmogus Kuris Nemoka Šokti',
  by: 'rokaslt', hue: 200,
  rx: { fire: 124, heart: 89, star: 56 },
  yesterday: 'Monika Liu — Sentimentai',
  candidates: [
    { artist: 'Monika Liu', title: 'Sentimentai', votes: 31 },
    { artist: 'Andrius Mamontovas', title: 'Laikas', votes: 28 },
    { artist: 'Jazzu', title: 'Kur Eisi', votes: 19 },
  ],
}

const EVENTS = [
  { d: '22', m: 'VAS', title: 'Kęstutis Antanėlis', venue: 'Žalgirio Arena', city: 'Kaunas', sold: false },
  { d: '28', m: 'VAS', title: 'Monika Liu Acoustic', venue: 'Tamsta Club', city: 'Vilnius', sold: false },
  { d: '01', m: 'KOV', title: 'Jurga & Orkestras', venue: 'LNFO', city: 'Vilnius', sold: false },
  { d: '15', m: 'KOV', title: 'Donatas Montvydas', venue: 'Compensa', city: 'Vilnius', sold: true },
  { d: '22', m: 'KOV', title: 'Andrius Mamontovas', venue: 'Forum Palace', city: 'Vilnius', sold: false },
]

const PRESS = [
  { artist: 'Silvester Belt', chip: 'Oficialus pranešimas', hue: 225, title: 'Oficiali Lietuvos daina „Eurovision 2026" pristatyta Bazelyje', ago: '2 val.' },
  { artist: 'Skamp', chip: 'Premjera', hue: 38, title: 'Skamp anunsavo pirmąjį albumą per 15 metų – „Sugrįžimas" gegužę', ago: '5 val.' },
  { artist: 'Granatas', chip: 'Renginys', hue: 155, title: 'Granatas paskelbė Vilniaus arenos koncertą spalio 18 d.', ago: '1 d.' },
  { artist: 'Andrius Mamontovas', chip: 'Interviu', hue: 280, title: 'Mamontovas: „Muzika visada randa kelią net tyliausiuose namuose"', ago: '2 d.' },
]

const SHOUTBOX = [
  { user: 'muzikoslt', msg: 'Kas žino kada bus kitas Skamp koncertas?', ago: '2 min.' },
  { user: 'rockfanas', msg: 'Mamontovas 🔥 visiška legenda', ago: '5 min.' },
  { user: 'jazzlover', msg: 'Ieškau bilieto į Jurgą 03-01, kas parduoda?', ago: '12 min.' },
  { user: 'indie_lt', msg: 'Saulės Kliošo EP yra fire 🎶', ago: '18 min.' },
  { user: 'vertejas', msg: 'Padėkite išverst Arctic Monkeys dainą!', ago: '23 min.' },
]

const CITIES = ['Visi', 'Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai']
const MF = ['Visi', 'Tik LT', 'Singlai', 'Albumai', 'EP']

// ── ATOMS ──────────────────────────────────────────────────────────────────────

function Pill({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all select-none ${
        active
          ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-900/40'
          : 'text-[#8b9ab5] border border-white/8 hover:text-white hover:border-white/18'
      }`}>
      {children}
    </button>
  )
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    'Singl': 'bg-blue-900/60 text-blue-300 border-blue-700/40',
    'Albumas': 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
    'EP': 'bg-violet-900/60 text-violet-300 border-violet-700/40',
  }
  return (
    <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${map[type] || 'bg-white/10 text-white/50 border-white/10'}`}>
      {type.toUpperCase()}
    </span>
  )
}

function TrendIcon({ t }: { t: string }) {
  if (t === 'up') return <span className="text-emerald-400 font-black text-xs leading-none">↑</span>
  if (t === 'down') return <span className="text-red-400 font-black text-xs leading-none">↓</span>
  if (t === 'new') return <span className="text-[9px] font-black text-amber-400 bg-amber-400/15 px-1.5 py-0.5 rounded">N</span>
  return <span className="text-[#3d4f6e] text-xs">—</span>
}

function SecHead({ label, cta }: { label: React.ReactNode; cta?: string }) {
  return (
    <div className="flex items-center justify-between mb-7">
      <h2 className="text-[22px] font-black text-white tracking-tight leading-none">{label}</h2>
      {cta && (
        <a href="#" className="text-sm text-[#4a6fa5] hover:text-white transition-colors font-semibold">
          {cta} →
        </a>
      )}
    </div>
  )
}

// ── MAIN ───────────────────────────────────────────────────────────────────────

export default function Home() {
  const [idx, setIdx] = useState(0)
  const [chartTab, setChartTab] = useState<'lt' | 'vote'>('lt')
  const [mf, setMf] = useState('Visi')
  const [city, setCity] = useState('Visi')
  const [rx, setRx] = useState(SOTD.rx)
  const [voted, setVoted] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goTo = useCallback((i: number) => {
    setIdx((i + SLIDES.length) % SLIDES.length)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setIdx(p => (p + 1) % SLIDES.length), 7000)
  }, [])

  useEffect(() => {
    timerRef.current = setTimeout(() => setIdx(p => (p + 1) % SLIDES.length), 7000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [idx])

  const s = SLIDES[idx]
  const chartData = chartTab === 'lt' ? CHARTS_LT : CHARTS_VOTE
  const releases = RELEASES.filter(r => {
    if (mf === 'Tik LT') return r.lt
    if (mf === 'Singlai') return r.type === 'Singl'
    if (mf === 'Albumai') return r.type === 'Albumas'
    if (mf === 'EP') return r.type === 'EP'
    return true
  })
  const events = city === 'Visi' ? EVENTS : EVENTS.filter(e => e.city === city)

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d1117', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06]"
        style={{ background: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(24px)' }}>
        <div className="max-w-[1280px] mx-auto px-5 lg:px-8 h-14 flex items-center gap-5">
          <Link href="/" className="font-black text-[22px] tracking-tight flex-shrink-0">
            <span className="text-white">music</span><span className="text-orange-400">.lt</span>
          </Link>

          <div className="flex-1 max-w-sm hidden md:block">
            <input type="text" placeholder="Ieškok atlikėjų, dainų, renginių…"
              className="w-full h-9 rounded-full px-4 text-sm text-white/80 placeholder:text-[#3d5070] focus:outline-none transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }} />
          </div>

          <nav className="hidden lg:flex items-center gap-0.5 ml-auto mr-3">
            {['Topai', 'Muzika', 'Renginiai', 'Atlikėjai', 'Bendruomenė'].map(n => (
              <a key={n} href="#"
                className="px-3 py-1.5 text-[13px] text-[#6b88b0] hover:text-white rounded-lg hover:bg-white/5 transition-all font-semibold">
                {n}
              </a>
            ))}
          </nav>

          <HeaderAuth />
        </div>
      </header>

      {/* ━━ HERO CAROUSEL — DĖMESIO CENTRE ━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden" style={{ background: s.bg, transition: 'background 0.8s ease', minHeight: 420 }}>
        {/* Glow */}
        <div className="absolute inset-0 pointer-events-none transition-all duration-700" style={{ background: s.glow }} />
        {/* Subtle grid texture */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <div className="relative max-w-[1280px] mx-auto px-5 lg:px-8 py-14 flex flex-col sm:flex-row items-center gap-10 sm:gap-16">
          {/* Cover art */}
          <div className="flex-shrink-0 relative">
            <div className="w-44 h-44 sm:w-56 sm:h-56 rounded-2xl shadow-2xl flex items-center justify-center text-7xl transition-all duration-700"
              style={{ background: s.cover, boxShadow: `0 32px 80px ${s.cover}55, 0 8px 24px rgba(0,0,0,0.6)` }}>
              ♪
            </div>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-black text-white" style={{ background: s.chipBg }}>
                {s.chip}
              </span>
              <span className="text-sm text-white/40 font-medium">{s.kicker}</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-black text-white leading-[1.05] tracking-tight mb-1">
              {s.artist}
            </h1>
            <p className="text-xl sm:text-2xl text-white/50 font-light mb-4 tracking-wide">{s.title}</p>
            <p className="text-white/40 text-sm leading-relaxed mb-8 max-w-md">{s.desc}</p>
            <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
              <button className="bg-orange-500 hover:bg-orange-400 text-white font-black px-7 py-3 rounded-full text-sm transition-all shadow-lg shadow-orange-900/50 hover:shadow-orange-800/60 hover:scale-[1.02] active:scale-[0.98]">
                {s.cta}
              </button>
              <button className="text-white/50 hover:text-white font-semibold px-5 py-3 rounded-full text-sm transition-all border border-white/10 hover:border-white/20">
                {s.ctaSecondary}
              </button>
            </div>
          </div>

          {/* Arrows */}
          <div className="hidden sm:flex flex-col gap-2 flex-shrink-0">
            {[-1, 1].map((dir) => (
              <button key={dir} onClick={() => goTo(idx + dir)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white transition-all hover:bg-white/10"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                {dir === -1 ? '←' : '→'}
              </button>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 items-center">
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 ${i === idx ? 'w-7 h-2 bg-orange-400' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`} />
          ))}
        </div>
      </section>

      {/* ━━ CONTENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="max-w-[1280px] mx-auto px-5 lg:px-8 py-12 space-y-16">

        {/* ━━ TOPAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Topai" cta="Visi topai" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

            {/* Chart panel */}
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {[{ key: 'lt', label: '🏛 Oficialūs (AGATA)' }, { key: 'vote', label: '🗳 Balsavimas' }].map(tab => (
                  <button key={tab.key} onClick={() => setChartTab(tab.key as 'lt' | 'vote')}
                    className={`flex-1 py-3.5 text-sm font-bold transition-all ${chartTab === tab.key
                      ? 'text-white bg-white/[0.04] border-b-2 border-[#1d4ed8]'
                      : 'text-[#4a6080] hover:text-[#8ba5c8]'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div>
                {chartData.map((t, i) => (
                  <div key={t.pos}
                    className="flex items-center gap-3.5 px-5 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                    style={{ borderBottom: i < chartData.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <span className={`w-5 text-center text-sm font-black flex-shrink-0 ${t.pos <= 3 ? 'text-orange-400' : 'text-[#2a3a50]'}`}>
                      {t.pos}
                    </span>
                    <div className="w-4 flex-shrink-0 flex items-center justify-center">
                      <TrendIcon t={t.trend} />
                    </div>
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] text-white/10 font-black"
                      style={{ background: `hsl(${t.pos * 43},30%,14%)` }}>♪</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-semibold text-white/90 truncate group-hover:text-blue-300 transition-colors">
                          {t.title}
                        </span>
                        {t.lt && <span className="text-[11px] flex-shrink-0 opacity-70">🇱🇹</span>}
                      </div>
                      <span className="text-xs text-[#4a6080] truncate block">{t.artist}</span>
                    </div>
                    {'wks' in t && typeof (t as {wks?: number}).wks === 'number' && (
                      <span className="text-[11px] text-[#2a3a50] flex-shrink-0">{(t as {wks: number}).wks} sav.</span>
                    )}
                    {'votes' in t && (
                      <span className="text-[11px] text-[#2a3a50] flex-shrink-0">{(t as {votes: number}).votes} ▲</span>
                    )}
                  </div>
                ))}
              </div>

              {chartTab === 'vote' && (
                <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(249,115,22,0.05)' }}>
                  <button className="w-full bg-orange-500 hover:bg-orange-400 text-white font-black py-2.5 rounded-xl text-sm transition-all hover:shadow-lg hover:shadow-orange-900/40">
                    🗳 Balsuoti už dainą
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-4">
              {[
                {
                  label: 'Labiausiai kyla',
                  items: CHARTS_LT.filter(t => t.trend === 'up').slice(0, 4),
                  icon: '↑', iconCls: 'text-emerald-400',
                },
                {
                  label: 'Nauji šią savaitę',
                  items: CHARTS_LT.filter(t => t.trend === 'new'),
                  icon: 'N', iconCls: 'text-amber-400',
                },
              ].map(box => (
                <div key={box.label} className="rounded-2xl p-5 flex-1"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-black text-[#2a3a50] uppercase tracking-[0.12em] mb-4">{box.label}</p>
                  <div className="space-y-3">
                    {box.items.map((t, i) => (
                      <div key={i} className="flex items-center gap-2.5 group cursor-pointer">
                        <span className={`text-xs font-black flex-shrink-0 ${box.iconCls}`}>{box.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white/80 truncate group-hover:text-blue-300 transition-colors">{t.title}</p>
                          <p className="text-xs text-[#3d5070] truncate">{t.artist}</p>
                        </div>
                        <span className="text-xs text-[#1e2e42] flex-shrink-0">#{t.pos}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ━━ NAUJA MUZIKA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="Nauja muzika" cta="Visi leidiniai" />
          <div className="flex gap-2 mb-6 flex-wrap">
            {MF.map(f => (
              <Pill key={f} active={mf === f} onClick={() => setMf(f)}>
                {f === 'Tik LT' ? '🇱🇹 Tik LT' : f}
              </Pill>
            ))}
          </div>
          <div className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {releases.map((r, i) => (
              <div key={i} className="flex-shrink-0 w-[150px] group cursor-pointer">
                <div className="aspect-square rounded-xl mb-3 relative overflow-hidden transition-transform duration-300 group-hover:scale-[1.03]"
                  style={{ background: `hsl(${r.hue},38%,16%)`, boxShadow: `0 16px 40px hsl(${r.hue},38%,8%)` }}>
                  <div className="absolute inset-0 flex items-center justify-center text-6xl text-white/[0.06] font-black select-none">♪</div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex items-center justify-center">
                    <div className="w-11 h-11 rounded-full bg-orange-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 duration-200 shadow-xl">
                      <span className="text-white text-base ml-0.5">▶</span>
                    </div>
                  </div>
                  {r.lt && <span className="absolute top-2 left-2 text-sm drop-shadow-lg">🇱🇹</span>}
                  <div className="absolute top-2 right-2">
                    <TypeBadge type={r.type} />
                  </div>
                </div>
                <p className="text-xs text-[#4a6080] truncate mb-0.5">{r.artist}</p>
                <h4 className="text-[14px] font-bold text-white/85 group-hover:text-blue-300 transition-colors leading-snug truncate">{r.title}</h4>
                <button className="mt-2 text-xs text-orange-400 hover:text-orange-300 font-bold transition-colors">Klausyti →</button>
              </div>
            ))}
          </div>
        </section>

        {/* ━━ DIENOS DAINA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="🎵 Dienos daina" />
          <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5">

            {/* Main card */}
            <div className="rounded-2xl p-7 relative overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.3) 0%, rgba(13,17,23,0.9) 100%)', border: '1px solid rgba(29,78,216,0.25)' }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 10% 80%, rgba(29,78,216,0.15) 0%, transparent 60%)' }} />
              <div className="relative flex items-start gap-5 mb-6">
                <div className="w-20 h-20 rounded-xl flex-shrink-0 flex items-center justify-center text-3xl shadow-2xl"
                  style={{ background: `hsl(${SOTD.hue},45%,16%)`, boxShadow: `0 16px 40px hsl(${SOTD.hue},45%,8%)` }}>
                  🎵
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#4a6080] mb-1">
                    Siūlo <span className="text-blue-400 font-bold">{SOTD.by}</span>
                  </p>
                  <h3 className="font-black text-2xl text-white leading-tight">{SOTD.artist}</h3>
                  <p className="text-white/50 text-sm mt-0.5">{SOTD.title}</p>
                </div>
              </div>
              <div className="relative flex gap-2 mb-5">
                {([['fire', '🔥', rx.fire], ['heart', '❤️', rx.heart], ['star', '⭐', rx.star]] as const).map(([k, e, c]) => (
                  <button key={k}
                    onClick={() => setRx(r => ({ ...r, [k]: r[k as keyof typeof r] + 1 }))}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
                    {e} <span className="text-white/80">{c}</span>
                  </button>
                ))}
              </div>
              <button className="relative w-full bg-orange-500 hover:bg-orange-400 text-white font-black py-3 rounded-xl text-sm transition-all shadow-lg shadow-orange-900/40 hover:shadow-orange-800/50">
                Klausyti →
              </button>
              <p className="relative text-xs text-[#2a3a50] mt-4 text-center">Vakar: {SOTD.yesterday}</p>
            </div>

            {/* Candidates */}
            <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[10px] font-black text-[#2a3a50] uppercase tracking-[0.12em] mb-5">
                Rytdienos pretendentai — balsuokite!
              </p>
              <div className="space-y-3 mb-5">
                {SOTD.candidates.map((c, i) => (
                  <button key={i} onClick={() => setVoted(i)} disabled={voted !== null}
                    className={`w-full flex items-center gap-3.5 p-4 rounded-xl text-left transition-all border ${
                      voted === i
                        ? 'border-blue-500/40 bg-blue-900/20'
                        : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03]'
                    } ${voted !== null && voted !== i ? 'opacity-35' : ''}`}>
                    <span className="text-[#1e2e42] font-black text-sm w-5 text-center flex-shrink-0">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-white/90">{c.artist}</p>
                      <p className="text-xs text-[#3d5070]">{c.title}</p>
                    </div>
                    <div className="text-right flex-shrink-0 mr-2">
                      <p className="text-lg font-black text-white">{voted === i ? c.votes + 1 : c.votes}</p>
                      <p className="text-[10px] text-[#2a3a50]">balsų</p>
                    </div>
                    {voted === null && <span className="text-xs text-blue-400 font-bold flex-shrink-0 pr-1">Balsuoti</span>}
                    {voted === i && <span className="text-xs text-emerald-400 font-bold flex-shrink-0 pr-1">✓</span>}
                  </button>
                ))}
              </div>
              <a href="#" className="text-xs text-[#2a3a50] hover:text-blue-400 transition-colors font-semibold">
                + Pasiūlyti dainą rytdienai
              </a>
            </div>
          </div>
        </section>

        {/* ━━ RENGINIAI + PRANEŠIMAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Renginiai */}
          <section>
            <SecHead label="Renginiai" cta="Visi renginiai" />
            <div className="flex gap-2 mb-5 flex-wrap">
              {CITIES.map(c => <Pill key={c} active={city === c} onClick={() => setCity(c)}>{c}</Pill>)}
            </div>
            <div className="space-y-2">
              {events.slice(0, 5).map((e, i) => (
                <div key={i}
                  className="flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer group transition-all"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onMouseEnter={el => (el.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                  onMouseLeave={el => (el.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
                  <div className="text-center w-9 flex-shrink-0">
                    <p className="text-xl font-black leading-none text-white">{e.d}</p>
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-wide">{e.m}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white/85 truncate group-hover:text-blue-300 transition-colors">{e.title}</p>
                    <p className="text-xs text-[#3d5070]">{e.venue} · {e.city}</p>
                  </div>
                  {e.sold
                    ? <span className="text-[11px] font-black text-red-400 bg-red-900/20 border border-red-800/30 px-2.5 py-1 rounded-full flex-shrink-0">Parduota</span>
                    : <button className="text-xs font-bold text-orange-400 hover:text-orange-300 flex-shrink-0 transition-colors">Bilietai →</button>
                  }
                </div>
              ))}
            </div>
          </section>

          {/* Pranešimai */}
          <section>
            <SecHead label="Atlikėjų pranešimai" cta="Visi pranešimai" />
            <div className="space-y-2">
              {PRESS.map((p, i) => (
                <div key={i}
                  className="flex gap-3.5 px-4 py-3.5 rounded-xl cursor-pointer group transition-all"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                  onMouseEnter={el => (el.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                  onMouseLeave={el => (el.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 text-white/25"
                    style={{ background: `hsl(${p.hue},35%,14%)` }}>
                    {p.artist[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: `hsl(${p.hue},40%,14%)`, color: `hsl(${p.hue},60%,65%)`, border: `1px solid hsl(${p.hue},40%,22%)` }}>
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
        </div>

        {/* ━━ GYVI POKALBIAI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SecHead label="💬 Gyvi pokalbiai" cta="Visi pokalbiai" />
          <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div>
              {SHOUTBOX.map((s, i) => (
                <div key={i}
                  className="flex items-start gap-3.5 px-5 py-3.5 hover:bg-white/[0.025] transition-colors"
                  style={{ borderBottom: i < SHOUTBOX.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 text-white/30 mt-0.5"
                    style={{ background: `hsl(${s.user.charCodeAt(0) * 19 % 360},30%,18%)` }}>
                    {s.user[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-blue-400">{s.user}</span>
                      <span className="text-[10px] text-[#1e2e42]">{s.ago}</span>
                    </div>
                    <p className="text-[13px] text-white/60 leading-relaxed">{s.msg}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
              <input type="text" placeholder="Rašyk žinutę… (reikia prisijungti)"
                className="flex-1 h-9 rounded-full px-4 text-sm text-white/70 placeholder:text-[#2a3a50] focus:outline-none transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }} />
              <button className="bg-[#1d4ed8] hover:bg-blue-500 text-white font-bold px-5 h-9 rounded-full text-sm transition-all flex-shrink-0">
                Siųsti
              </button>
            </div>
          </div>
        </section>

        {/* ━━ ATLIKĖJAMS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <div className="rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-7 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(29,78,216,0.12) 0%, rgba(255,255,255,0.02) 100%)', border: '1px solid rgba(29,78,216,0.2)' }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 0% 50%, rgba(29,78,216,0.1) 0%, transparent 55%)' }} />
            <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl bg-[#1d4ed8]/20 border border-[#1d4ed8]/25 flex items-center justify-center text-3xl">
              🎤
            </div>
            <div className="relative flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-black text-white mb-1.5">Atlikėjams</h3>
              <p className="text-[#4a6080] text-sm leading-relaxed max-w-lg">
                Sukurk arba perimk savo profilį Music.lt platformoje. Skelk naujienas, renginius ir naują muziką tiesiai savo gerbėjams — nemokamai.
              </p>
            </div>
            <button className="relative flex-shrink-0 bg-orange-500 hover:bg-orange-400 text-white font-black px-8 py-3.5 rounded-full text-sm transition-all shadow-lg shadow-orange-900/40 hover:shadow-orange-800/50 hover:scale-[1.02] whitespace-nowrap">
              Pradėti nemokamai →
            </button>
          </div>
        </section>

      </div>

      {/* ━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: '#080b11' }}>
        <div className="max-w-[1280px] mx-auto px-5 lg:px-8 py-12">
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
