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
}

export function LazySection({
  children,
  placeholder = null,
  rootMargin = '400px',
  minHeight = 200,
  eager = false,
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
    return () => obs.disconnect()
  }, [visible, rootMargin])

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? children : placeholder}
    </div>
  )
}
