'use client'
// app/v2/useHeroSeen.ts
//
// Bendra „peržiūrėtų" hero kortelių būsena HeroSlider (desktop) ir MobileHero
// (mobile) komponentams. Raktas = slideKey (`${type}::${href}`).
//
//  - Svečias (neprisijungęs): localStorage 'reels_seen' — per įrenginį.
//  - Prisijungęs: server DB (/api/hero/seen) — SURIŠTA per visus įrenginius.
//    Ant mount: sumerge'inam localStorage + server; taip pat POST'inam lokalius
//    raktus į server (kad ankstesnė šio įrenginio istorija migruotų į paskyrą).
//    markSeen: iškart local + optimistiškai POST į server.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'

const LS_KEY = 'reels_seen'

function readLocal(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') as string[] } catch { return [] }
}
function writeLocal(keys: Set<string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(keys))) } catch { /* ignore */ }
}

export function useHeroSeen() {
  const { data: session, status } = useSession()
  const authed = !!session?.user
  // Pradžioj tuščia — kad SSR ir pirmas client render'is sutaptų (be hydration
  // mismatch); užpildom po mount effect'e.
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const syncedRef = useRef(false)

  useEffect(() => {
    // 1) localStorage — momentaliai (veikia svečiams ir kaip greitas cache).
    const local = readLocal()
    setSeen(new Set(local))

    // 2) prisijungusiems — server merge + push lokalių raktų vieną kartą.
    if (status !== 'authenticated') return
    let on = true
    fetch('/api/hero/seen', { cache: 'no-store' })
      .then(r => r.json())
      .then((d) => {
        if (!on || !Array.isArray(d?.keys)) return
        setSeen(prev => new Set([...prev, ...d.keys]))
      })
      .catch(() => {})
    // Migruojam šio įrenginio localStorage istoriją į paskyrą (vieną kartą).
    if (!syncedRef.current && local.length) {
      syncedRef.current = true
      fetch('/api/hero/seen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: local }), keepalive: true,
      }).catch(() => {})
    }
    return () => { on = false }
  }, [status])

  const markSeen = useCallback((key: string) => {
    setSeen(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev); next.add(key)
      writeLocal(next)
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
