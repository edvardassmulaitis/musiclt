// app/vartotojas/[username]/opengraph-image.tsx
//
// Dinaminė OG (share) kortelė profiliui — rodoma kai /@username dalinamas
// socialiniuose tinkluose. V18f: turtingesnė prekės ženklo kortelė su
// „muzikinio skonio" equalizer motyvu (genre spalvomis). Maksimaliai
// robustiška: edge runtime, JOKIO DB fetch'o ar remote image — niekada ne tuščia.

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'music.lt profilis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// „Muzikinis skonis" equalizer spalvos (atitinka profilio stulpelius).
const BARS: { c: string; h: number }[] = [
  { c: '#ec4899', h: 120 }, { c: '#22d3ee', h: 168 }, { c: '#fbbf24', h: 96 },
  { c: '#a78bfa', h: 210 }, { c: '#ef4444', h: 260 }, { c: '#9ca3af', h: 180 },
  { c: '#34d399', h: 132 }, { c: '#f97316', h: 156 },
]

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let name = username || ''
  try { name = decodeURIComponent(username) } catch { /* keep raw */ }
  const initial = (name.trim()[0] || '?').toUpperCase()
  const big = name.length > 14

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
          background: 'linear-gradient(135deg, #0a0e13 0%, #121823 55%, #241405 100%)',
          color: '#ffffff', fontFamily: 'sans-serif',
        }}
      >
        {/* Equalizer motyvas — apačios fonas (genre spalvos) */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 280, opacity: 0.5 }}>
          {BARS.concat(BARS).map((b, i) => (
            <div key={i} style={{ width: 70, height: b.h, background: b.c, borderTopLeftRadius: 10, borderTopRightRadius: 10 }} />
          ))}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,14,19,0.2) 0%, rgba(10,14,19,0.75) 70%, rgba(10,14,19,0.95) 100%)' }} />

        {/* Top: logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '60px 72px 0', fontSize: 38, fontWeight: 800 }}>
          <span style={{ color: '#ffffff' }}>music</span>
          <span style={{ color: '#f97316' }}>.lt</span>
        </div>

        {/* Center: monograma + vardas */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '0 72px 70px' }}>
          <div
            style={{
              width: 176, height: 176, borderRadius: 40, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 92, fontWeight: 800,
              background: 'linear-gradient(135deg, #f97316, #fb7185)', color: '#0b0f14',
              marginRight: 44, boxShadow: '0 20px 60px rgba(249,115,22,0.45)', flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: big ? 64 : 84, fontWeight: 800, lineHeight: 1.04 }}>{name}</div>
            <div style={{ marginTop: 16, fontSize: 30, color: '#9aa7ba' }}>muzikinis skonis · dienoraštis · kolekcija</div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
