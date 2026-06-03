import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { SiteShell } from '@/components/SiteShell'

export const metadata: Metadata = {
  // metadataBase — kad santykiniai OG/canonical URL'ai (pvz. „/topai") būtų
  // teisingai paversti absoliučiais visuose puslapiuose.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://music.lt'),
  title: 'Music.lt - Lietuviškos muzikos bendruomenė',
  description: 'Lietuviškos muzikos atlikėjai, albumai, dainos ir renginiai',
  openGraph: { type: 'website', locale: 'lt_LT', siteName: 'Music.lt' },
  // Explicit icon override — Vercel default „V" favicon nepriima icon.svg
  // konvencijos kai kuriuose browser'iuose. Forcing per metadata.icons.
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
}

// Viewport: initialScale=1 yra kritinis iOS Safari auto-zoom prevention'ui
// kai contenteditable / input gauna focus. Be jo iOS zoom'ina į input
// koordinates, sumaišydamas viewport'ą. Default Next'as kartais nepateikia.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale=1 sutaupytų zoom-į-input, bet sulaužytų pinch-zoom accessibility.
  // Plačiausia tinkama formula — initialScale=1 + input font ≥ 16px.
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="lt">
      <head>
        {/* Defensive favicon link — forcing icon.svg net jei Next.js
            metadata.icons negeneruoja link tag'o teisingai. */}
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          <SiteShell>
            {children}
          </SiteShell>
        </AuthProvider>
      </body>
    </html>
  )
}
