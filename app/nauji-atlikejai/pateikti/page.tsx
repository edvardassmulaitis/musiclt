// app/nauji-atlikejai/pateikti/page.tsx
//
// Atlikėjo pateikimo forma radarui. Anonimiškai (be prisijungimo) → moderacijos
// eilė. robots: noindex (turinio nėra, tik forma). Apsaugos — žr. /api/radar/submit.

import type { Metadata } from 'next'
import Link from 'next/link'
import RadarSubmitForm from '@/components/radaras-submit-form'

export const metadata: Metadata = {
  title: 'Pasiūlyk atlikėją — naujos muzikos radaras | music.lt',
  description: 'Pristatyk naują ar mažai žinomą Lietuvos atlikėją music.lt naujos muzikos radarui.',
  robots: { index: false, follow: true },
}

export default function RadarSubmitPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 20px 90px' }}>
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        <Link href="/nauji-atlikejai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Naujos muzikos radaras</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Pasiūlyk atlikėją</span>
      </nav>

      <h1 style={{
        fontFamily: "'Outfit', sans-serif", fontSize: 'clamp(1.6rem, 1.1rem + 1.6vw, 2.1rem)',
        fontWeight: 900, letterSpacing: '-0.025em', lineHeight: 1.05, color: 'var(--text-primary)',
      }}>
        Pasiūlyk atlikėją radarui
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14.5, lineHeight: 1.55, margin: '10px 0 26px', maxWidth: 560 }}>
        Esi naujas ar mažai žinomas Lietuvos kūrėjas — arba pažįsti tokį? Pristatyk jį čia.
        Peržiūrėsime ir įtrauksime tinkamus į <Link href="/nauji-atlikejai" style={{ color: 'var(--accent-link)' }}>radarą</Link>.
        Prisijungti nebūtina.
      </p>

      <RadarSubmitForm />
    </div>
  )
}
