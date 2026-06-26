'use client'

import { useEffect, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { SiteProvider } from '@/components/SiteContext'
import { NavigationProgress } from '@/components/NavigationProgress'
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
  // /srautas — app-stiliaus feed'as: be footer'io (hard stop ties paskutiniu
  // siūlymu), kad mobile'e nesimatytų footeris po turiniu.
  const isFeed = pathname?.startsWith('/srautas')
  // Atlikėjų pristatomieji (landing) puslapiai — pilnai immersyvūs, be jokio
  // site chrome (header/footer/bottom-nav). Eksperimentinė funkcija.
  const isLanding = pathname?.startsWith('/landing') || pathname === '/@jessicashy'

  // Apatinis mobile baras rodomas VISUR (įskaitant aktyvų pokalbį), išskyrus
  // admin'ą — kad niekur „nedingtų". Chat'as pats rezervuoja barui vietą per
  // --bottom-nav-h (height calc), todėl jam NEpridedam has-bottom-nav padding'o
  // (kitaip dubliuotųsi tarpas). Normalūs puslapiai gauna padding'ą.
  const showBottomNav = !isAdmin && !isLanding
  const mainHasPadding = showBottomNav && !isChat

  useEffect(() => {
    if (!isChat) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isChat])

  return (
    <SiteProvider>
      {/* Globalus instant-feedback indikatorius — startuoja ant click'o,
          dar prieš Next router'iui pradedant navigaciją. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      {!isAdmin && !isLanding && <SiteHeader />}
      <main className={mainHasPadding ? 'has-bottom-nav' : undefined}>{children}</main>
      {!isAdmin && !isChat && !isFeed && !isLanding && <SiteFooter />}
      {showBottomNav && <MobileBottomNav />}
      {!isAdmin && !isLanding && <QuickCreate />}
    </SiteProvider>
  )
}
