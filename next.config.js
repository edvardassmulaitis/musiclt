/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ]
  },
}
module.exports = nextConfig
