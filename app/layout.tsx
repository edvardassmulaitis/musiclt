import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'

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
      <body className="bg-gradient-to-br from-black via-slate-900 to-slate-800 min-h-screen text-white">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
