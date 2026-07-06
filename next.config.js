/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

// CSP paleidžiamas Report-Only režimu — svetainė renderina YouTube/Spotify embed'us
// ir user turinį, tad pirma stebim pažeidimus (browser console) ir tik tada
// perjungiam į enforcing (pervadinti header'į į 'Content-Security-Policy').
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()' },
]

const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      { protocol: 'https', hostname: '**.fbcdn.net' },
      // Wikipedia / Wikimedia nuotraukos
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: '**.wikipedia.org' },
      // Spotify
      { protocol: 'https', hostname: 'i.scdn.co' },
      // YouTube
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'img.youtube.com' },
    ],
  },
  async redirects() {
    return [
      // Renginių hub'as pervadintas į „Koncertai" (SEO: tikslesnis terminas).
      // Tik tikslus /renginiai → /koncertai; renginio detalės lieka /renginiai/[slug].
      { source: '/renginiai', destination: '/koncertai', permanent: true },
      { source: '/zanrai', destination: '/muzikos-stilius', permanent: true },
      { source: '/zanrai/:slug', destination: '/muzikos-stilius/:slug', permanent: true },
      // Boombox išskaidytas į „Dienos iššūkį" (2026-07-06, testuotojo feedback:
      // pavadinimas neaiškus). Ne permanent — jei kada grįžtų atskiras puslapis.
      { source: '/boombox', destination: '/zaidimai/dienos', permanent: false },
    ]
  },
}
module.exports = nextConfig
