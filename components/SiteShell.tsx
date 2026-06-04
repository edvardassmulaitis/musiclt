'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SiteProvider } from '@/components/SiteContext'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { QuickCreate } from '@/components/QuickCreate'
import { AdminQuickAddModal } from '@/components/AdminQuickAddModal'

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin')
  // Pokalbiai turi tampti "atskiru app'u" — be footer'io, be body scroll'o.
  // Header'į paliekam (svarbu top-nav navigacijai), bet apačia uždara.
  const isChat = pathname?.startsWith('/pokalbiai')

  // Apatinis mobile baras rodomas VISUR (įskaitant aktyvų pokalbį), išskyrus
  // admin'ą — kad niekur „nedingtų". Chat'as pats rezervuoja barui vietą per
  // --bottom-nav-h (height calc), todėl jam NEpridedam has-bottom-nav padding'o
  // (kitaip dubliuotųsi tarpas). Normalūs puslapiai gauna padding'ą.
  const showBottomNav = !isAdmin
  const mainHasPadding = showBottomNav && !isChat

  useEffect(() => {
    if (!isChat) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isChat])

  return (
    <SiteProvider>
      {!isAdmin && <SiteHeader />}
      <main className={mainHasPadding ? 'has-bottom-nav' : undefined}>{children}</main>
      {!isAdmin && !isChat && <SiteFooter />}
      {showBottomNav && <MobileBottomNav />}
      {!isAdmin && <QuickCreate />}
      {/* Greitas pridėjimas (admin) — modalas paleidžiamas iš public ir admin header'ių. */}
      <AdminQuickAddModal />
    </SiteProvider>
  )
}
