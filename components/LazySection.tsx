'use client'

/**
 * <LazySection> — render'ina children tik kai jie arti viewport'o.
 *
 * Naudojam homepage'o below-the-fold sekcijoms (Renginiai, Bendruomenė,
 * Pramogos, Istorija). Above-the-fold (hero, Naujos dainos, Nauji albumai)
 * lieka eager'iniai — jie reikalingi kuo greičiau prie pirmo paint'o.
 *
 * Veikia per IntersectionObserver:
 *   - `rootMargin: 400px` — start'inam render'inimą kai user'is dar nepriėjo
 *     iki sekcijos (~viewport'o aukštyje). Po render'io component'ai
 *     fetchina savo duomenis (useEffect mount'e), todėl iki user'iui
 *     pasiekiant sekciją, duomenys jau dažniausiai bus krauti.
 *   - Po pirmo intersection — observer disconnect'inamas, kad nelikt'ų
 *     boilerplate (sekcijos lieka render'intos).
 *
 * Browser support: IntersectionObserver visur (95%+). Fallback'as: jei API
 * nepalaikomas, iškart render'inam (eager). Geriau eager nei niekad.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'

type LazySectionProps = {
  children: ReactNode
  /** Skeleton arba placeholder'is, rodomas iki intersection. */
  placeholder?: ReactNode
  /** Kaip toli iki viewport'o pradedam render'inti. Default 400px. */
  rootMargin?: string
  /** Min height kol nerender'inta — kad scroll nešokčiotų po hydration'o. */
  minHeight?: number | string
  /** Disable'inam lazy elgseną (debugging). */
  eager?: boolean
  /**
   * IDLE PREFETCH: po tiek ms nuo mount'o sekcija render'inama IR JEI dar
   * nepriscrollinta — kad below-fold turinys (Bendruomenė, Istorija) užsikraut'ų
   * fone, kol user'is skaito viršų, ir NEBŪTŲ „pop-in" priscrollinus. IO lieka
   * greitam scroll'ui. Default 1800ms (po above-fold krovimosi). 0 = išjungta.
   */
  idleDelay?: number
}

export function LazySection({
  children,
  placeholder = null,
  rootMargin = '400px',
  minHeight = 200,
  eager = false,
  idleDelay = 1800,
}: LazySectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)

  useEffect(() => {
    if (visible) return
    if (typeof window === 'undefined') return
    if (!('IntersectionObserver' in window)) {
      // Sena naršyklė — render'inam iškart.
      setVisible(true)
      return
    }
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            obs.disconnect()
            break
          }
        }
      },
      { rootMargin, threshold: 0.01 }
    )
    obs.observe(el)

    // Idle prefetch — sekcija atsiranda net be scroll'o, kad duomenys būtų
    // paruošti iš anksto (dažniausiai anksčiau nei user'is priscrollina).
    let idleT: ReturnType<typeof setTimeout> | null = null
    if (idleDelay > 0) {
      idleT = setTimeout(() => { setVisible(true); obs.disconnect() }, idleDelay)
    }
    return () => { obs.disconnect(); if (idleT) clearTimeout(idleT) }
  }, [visible, rootMargin, idleDelay])

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? children : placeholder}
    </div>
  )
}
