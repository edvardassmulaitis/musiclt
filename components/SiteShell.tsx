'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SiteProvider } from '@/components/SiteContext'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')
  // Pokalbiai turi tampti "atskiru app'u" — be footer'io, be body scroll'o.
  // Header'į paliekam (svarbu top-nav navigacijai), bet apačia uždara.
  const isChat = pathname?.startsWith('/pokalbiai')

  useEffect(() => {
    if (!isChat) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isChat])

  return (
    <SiteProvider>
      {!isAdmin && <SiteHeader />}
      <main>{children}</main>
      {!isAdmin && !isChat && <SiteFooter />}
    </SiteProvider>
  )
}
