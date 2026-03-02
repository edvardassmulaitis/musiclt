'use client'

import { SiteProvider, useSite } from '@/components/SiteContext'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

function ShellInner({ children }: { children: React.ReactNode }) {
  const { dk } = useSite()
  return (
    <div className="min-h-screen flex flex-col" style={{ background: dk ? '#0d1117' : '#f0f4fa', color: dk ? '#f2f4f8' : '#1a2540', transition: 'background 0.3s, color 0.3s' }}>
      <SiteHeader />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <SiteProvider>
      <ShellInner>{children}</ShellInner>
    </SiteProvider>
  )
}
