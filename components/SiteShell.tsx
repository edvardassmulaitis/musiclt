'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SiteProvider } from '@/components/SiteContext'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { QuickCreate } from '@/components/QuickCreate'

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')
  // Pokalbiai turi tampti "atskiru app'u" — be footer'io, be body scroll'o.
  // Header'į paliekam (svarbu top-nav navigacijai), bet apačia uždara.
  const isChat = pathname?.startsWith('/pokalbiai')

  // Apatinis mobile baras: rodom visur (įskaitant /pokalbiai pokalbių SĄRAŠĄ,
  // kad jaustųsi kaip in-app tab'as), išskyrus admin ir AKTYVŲ pokalbį
  // (/pokalbiai/...), kuris yra pilno ekrano. ChatLayout list view'e rezervuoja
  // vietą barui per --bottom-nav-h.
  const isChatDeep = pathname?.startsWith('/pokalbiai/')
  const showBottomNav = !isAdmin && !isChatDeep

  useEffect(() => {
    if (!isChat) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isChat])

  return (
    <SiteProvider>
      {!isAdmin && <SiteHeader />}
      <main className={showBottomNav ? 'has-bottom-nav' : undefined}>{children}</main>
      {!isAdmin && !isChat && <SiteFooter />}
      {showBottomNav && <MobileBottomNav />}
      {!isAdmin && <QuickCreate />}
    </SiteProvider>
  )
}
