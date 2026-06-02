// app/vartotojas/[username]/opengraph-image.tsx
//
// Dinaminė OG (share) kortelė profiliui — rodoma kai /@username dalinamas
// socialiniuose tinkluose. Robustiška: jokio remote avatar fetch'o (monograma),
// tik diakritikos-saugus tekstas (numeriai + ASCII LT žodžiai be diakritikų),
// tad @vercel/og default font'as viską atvaizduoja be tofu.

import { ImageResponse } from 'next/og'
import { getProfileByUsername, getProfileLikesCounts } from '@/lib/supabase-blog'

export const runtime = 'nodejs'
export const alt = 'music.lt profilis'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let profile: any = null
  let likes = 0
  try {
    profile = await getProfileByUsername(decodeURIComponent(username))
    if (profile) {
      const counts = await getProfileLikesCounts(profile.username)
      likes = (counts?.track?.resolved || 0) + (counts?.album?.resolved || 0) + (counts?.artist?.resolved || 0)
    }
  } catch { /* render fallback below */ }

  const name = (profile?.username || username || '').toString()
  const initial = (name.trim()[0] || '?').toUpperCase()
  const year = profile?.joined_legacy_at
    ? new Date(profile.joined_legacy_at).getFullYear()
    : profile?.created_at ? new Date(profile.created_at).getFullYear() : null
  const likesStr = likes > 0 ? likes.toLocaleString('lt-LT') : null

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
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: '#ffffff' }}>music</span>
          <span style={{ color: '#f97316' }}>.lt</span>
        </div>

        {/* Center: monogram + username */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 176, height: 176, borderRadius: 32, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 92, fontWeight: 800,
              background: 'linear-gradient(135deg, #f97316, #fb7185)', color: '#0b0f14',
              marginRight: 44, flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>@{name}</div>
            <div style={{ marginTop: 18, fontSize: 30, color: '#9aa7ba' }}>muzikos profilis</div>
          </div>
        </div>

        {/* Stat row (diakritikos-saugus) */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#cdd6e3' }}>
          {likesStr && (
            <span style={{ display: 'flex', marginRight: 40 }}>
              <span style={{ color: '#f97316', fontWeight: 800, marginRight: 12 }}>{likesStr}</span>
              <span>patiktukai</span>
            </span>
          )}
          {year && (
            <span style={{ display: 'flex' }}>
              <span style={{ color: '#f97316', fontWeight: 800, marginRight: 12 }}>narys nuo</span>
              <span>{year}</span>
            </span>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}
