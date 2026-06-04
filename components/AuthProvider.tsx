'use client'

import { SessionProvider } from 'next-auth/react'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ImpersonationBanner />
      {children}
    </SessionProvider>
  )
}
