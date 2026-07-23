'use client'
// app/v2/useHeroSeen.ts
//
// Bendra „peržiūrėtų" hero kortelių būsena HeroSlider (desktop) ir MobileHero
// (mobile) komponentams. Raktas = slideKey (`${type}::${href}`).
//
//  - Svečias (neprisijungęs): localStorage 'reels_seen' — per įrenginį.
//  - Prisijungęs: TIK server DB (/api/hero/seen) — SURIŠTA per visus įrenginius.
//    Sąmoningai NEmerge'inam localStorage į prisijungusio rinkinį ir NEpush'inam
//    jo į server — kitaip vieno įrenginio naršymo/testų šiukšlės „užterštų"
//    paskyrą (visos naujienos taptų „skaitytos"). Server = vienintelis tiesos
//    šaltinis prisijungusiam; markSeen rašo tik į server pirmyn.

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'

const LS_KEY = 'reels_seen'

function readLocal(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as string[] } catch { return [] }
}
function writeLocal(keys: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(keys))) } catch { /* ignore */ }
}

export function useHeroSeen() {
  const { status } = useSession()
  const authed = status === 'authenticated'
  // Pradžioj tuščia — kad SSR ir pirmas client render'is sutaptų (be hydration
  // mismatch); užpildom po mount effect'e pagal auth būseną.
  const [seen, setSeen] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'authenticated') {
      // Prisijungęs → TIK server (surišta per įrenginius).
      let on = true
      fetch('/api/hero/seen', { cache: 'no-store' })
        .then(r => r.json())
        .then((d) => { if (on && Array.isArray(d?.keys)) setSeen(new Set(d.keys)) })
        .catch(() => {})
      return () => { on = false }
    }
    // Svečias → localStorage.
    setSeen(new Set(readLocal()))
  }, [status])

  const markSeen = useCallback((key: string) => {
    setSeen(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev); next.add(key)
      if (!authed) writeLocal(next)   // svečio istorija — tik lokaliai
      return next
    })
    if (authed) {
      fetch('/api/hero/seen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }), keepalive: true,
      }).catch(() => {})
    }
  }, [authed])

  return { seen, markSeen }
}
