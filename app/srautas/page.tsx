'use client'

/**
 * /srautas — ❤️ asmeninė muzikos zona. Du režimai: „Mėgstami" / „Tau gali patikti".
 *
 * Plonas wrapper'is: visa srauto logika gyvena bendrame <StreamFeed> komponente
 * (components/srautas/StreamFeed.tsx), kurį naudoja IR Mano muzikos „Atradimai" tab'as.
 * Čia tik URL sinchronizacija — ?t=tau deep-link'ai ir režimo perjungimo atspindys
 * adreso juostoje (router.replace). StreamFeed pats tvarko savo režimo state.
 */

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StreamFeed, type Mode } from '@/components/srautas/StreamFeed'

function SrautasInner() {
  const router = useRouter()
  const params = useSearchParams()
  const initialMode: Mode = params.get('t') === 'tau' ? 'tau' : 'sekami'

  const onModeChange = (m: Mode) => {
    const sp = new URLSearchParams(Array.from(params.entries()))
    if (m === 'sekami') sp.delete('t'); else sp.set('t', m)
    const qs = sp.toString()
    router.replace(`/srautas${qs ? `?${qs}` : ''}`, { scroll: false })
  }

  return <StreamFeed initialMode={initialMode} onModeChange={onModeChange} />
}

export default function SrautasPage() {
  return (
    <Suspense fallback={<div className="sr-wrap" style={{ padding: 40 }} />}>
      <SrautasInner />
    </Suspense>
  )
}
