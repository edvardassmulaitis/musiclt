'use client'

// app/error.tsx — homepage error boundary (insurance saugiklis).
//
// page.tsx THROW'ina, kai seed'as nepavyksta, kad Next ISR išlaikytų paskutinį
// gerą cache'intą puslapį (žr. page.tsx header'į). Realūs vartotojai tokiu
// atveju gauna STALE gerą puslapį — šis boundary'is suveikia tik retu pirmo
// generavimo (po deploy, be jokio stale) atveju.
//
// Elgsena: vieną kartą automatiškai perkrauname puslapį (regeneracija dažniausiai
// iškart pavyksta — transient'as būna trumpas). Loop'o saugiklis: `?_r=1` žymė
// URL'e — jei jau bandėme, NEbekrauname automatiškai, rodom rankinį mygtuką.

import { useEffect, useState } from 'react'

export default function HomeError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [autoTried, setAutoTried] = useState(true)

  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (!url.searchParams.has('_r')) {
        // Pirmas kartas — pridedam žymę ir perkraunam (švari regeneracija).
        url.searchParams.set('_r', '1')
        window.location.replace(url.toString())
        return
      }
    } catch {
      /* no-op */
    }
    // Jau bandėme auto-reload — rodom rankinį UI (be loop'o).
    setAutoTried(false)
  }, [])

  // Kol vyksta vienkartinis auto-reload — rodom tylų kraunasi state'ą.
  if (autoTried) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span
          aria-hidden
          style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid rgba(249,115,22,0.25)', borderTopColor: 'var(--accent-orange)',
            display: 'inline-block', animation: 'mz-spin 0.8s linear infinite',
          }}
        />
        <style>{'@keyframes mz-spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '60vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 18, color: 'var(--text-primary,#fff)' }}>
        Nepavyko užkrauti pagrindinio puslapio
      </p>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted,#9aa)', maxWidth: 360 }}>
        Trumpas ryšio trūkčiojimas. Pabandyk dar kartą — paprastai užtenka.
      </p>
      <button
        type="button"
        onClick={() => {
          // Nuimam `_r` žymę, kad kitas error'as vėl galėtų auto-reload'inti.
          try {
            const url = new URL(window.location.href)
            url.searchParams.delete('_r')
            window.history.replaceState(null, '', url.toString())
          } catch { /* no-op */ }
          reset()
        }}
        style={{
          fontFamily: "'Outfit',sans-serif", fontWeight: 700, fontSize: 14, color: '#fff',
          background: 'var(--accent-orange)', border: 'none', borderRadius: 999, padding: '10px 22px', cursor: 'pointer',
        }}
      >
        Bandyti dar kartą
      </button>
    </div>
  )
}
