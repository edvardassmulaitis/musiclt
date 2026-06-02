// app/vartotojas/[username]/opengraph-image.tsx
//
// Dinaminė OG (share) kortelė profiliui — rodoma kai /@username dalinamas
// socialiniuose tinkluose. Maksimaliai robustiška: edge runtime, JOKIO DB
// fetch'o ar remote image (monograma iš username), tik diakritikos-saugus
// tekstas → @vercel/og default font'as viską atvaizduoja be klaidų.

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'music.lt profilis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let name = username || ''
  try { name = decodeURIComponent(username) } catch { /* keep raw */ }
  const initial = (name.trim()[0] || '?').toUpperCase()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', padding: '64px 72px',
          background: 'linear-gradient(135deg, #0b0f14 0%, #141a22 55%, #2a1a0e 100%)',
          color: '#ffffff', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, fontWeight: 700 }}>
          <span style={{ color: '#ffffff' }}>music</span>
          <span style={{ color: '#f97316' }}>.lt</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 184, height: 184, borderRadius: 36, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 96, fontWeight: 700,
              background: 'linear-gradient(135deg, #f97316, #fb7185)', color: '#0b0f14',
              marginRight: 48,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05 }}>@{name}</div>
            <div style={{ marginTop: 20, fontSize: 32, color: '#9aa7ba' }}>muzikos profilis</div>
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 30, color: '#cdd6e3' }}>
          <span>Mano muzikinis skonis, dienorastis ir kolekcija</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
