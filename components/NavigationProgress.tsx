'use client'

// Globali navigacijos progress juosta.
//
// PROBLEMA, kurią sprendžia: Next App Router'yje paspaudus <Link> į dinaminį
// puslapį, naršyklė lieka ant SENO puslapio kol serveris surenderina naują
// (DB užklausos kelias sekundes). Nors `loading.tsx` boundary egzistuoja,
// tarp paspaudimo ir kol React'as commit'ina loading state'ą būna juntamas
// gap'as → naudotojui atrodo, kad clickas „nesuveikė".
//
// Sprendimas: ši juosta startuoja ant PAČIO click event'o (capture faze,
// dar prieš Next router'į), tad feedback'as yra IŠ KARTO — nepriklausomai
// nuo to ar maršrutas turi loading.tsx, ar prefetchintas, ar ne.
//
// Dependency-free (be nprogress / next-toploader). Užbaigia kai URL
// (pathname arba search) pasikeičia = navigacija commit'inta.

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const TRICKLE_MS = 240        // kaip dažnai „pakrutinam" progresą
const TRICKLE_CAP = 92        // iki kiek % trickle'ina laukiant
const SAFETY_MS = 12000       // jei navigacija nutrūko — auto-baigiam
const FADE_MS = 280           // fade-out po 100%

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)

  const activeRef = useRef(false)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (trickleRef.current) { clearInterval(trickleRef.current); trickleRef.current = null }
    if (fadeRef.current) { clearTimeout(fadeRef.current); fadeRef.current = null }
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
  }

  const start = () => {
    if (activeRef.current) return
    activeRef.current = true
    clearTimers()
    setVisible(true)
    setProgress(8)
    trickleRef.current = setInterval(() => {
      setProgress(p => (p >= TRICKLE_CAP ? p : p + (TRICKLE_CAP - p) * 0.14))
    }, TRICKLE_MS)
    safetyRef.current = setTimeout(() => done(), SAFETY_MS)
  }

  const done = () => {
    if (!activeRef.current) return
    activeRef.current = false
    clearTimers()
    setProgress(100)
    fadeRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, FADE_MS)
  }

  // Startas ant click'o (capture — prieš Next router handler'į) + programinės
  // navigacijos (router.push/replace naudoja history API) + naršyklės back/fwd.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const a = target?.closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href) return
      if (a.getAttribute('target') === '_blank') return
      if (a.hasAttribute('download')) return
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.origin !== window.location.origin) return
        // Ta pati vieta → nėra navigacijos.
        if (url.pathname === window.location.pathname && url.search === window.location.search) return
      } catch {
        return
      }
      start()
    }

    document.addEventListener('click', onClick, true)

    // router.push / router.replace → history.pushState / replaceState
    const origPush = history.pushState
    const origReplace = history.replaceState
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      start()
      return origPush.apply(this, args)
    }
    history.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
      return origReplace.apply(this, args)
    }
    const onPop = () => start()
    window.addEventListener('popstate', onPop)

    return () => {
      document.removeEventListener('click', onClick, true)
      history.pushState = origPush
      history.replaceState = origReplace
      window.removeEventListener('popstate', onPop)
      clearTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // URL pasikeitė (pathname arba search) → navigacija commit'inta → baigiam.
  useEffect(() => {
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  if (!visible) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 10000,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent-orange, var(--accent-orange))',
          boxShadow: '0 0 8px var(--accent-orange, var(--accent-orange)), 0 0 4px var(--accent-orange, var(--accent-orange))',
          borderRadius: '0 2px 2px 0',
          transition: 'width 200ms ease-out',
        }}
      />
    </div>
  )
}
