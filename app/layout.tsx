import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import { SiteShell } from '@/components/SiteShell'

export const metadata: Metadata = {
  title: 'Music.lt - Lietuviškos muzikos bendruomenė',
  description: 'Lietuviškos muzikos atlikėjai, albumai, dainos ir renginiai',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="lt">
      <head>
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
