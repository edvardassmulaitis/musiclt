// app/apie-mus/page.tsx
//
// „Apie mus" — pristatymo/SEO puslapis. Turinys grįstas realiomis svetainės
// funkcijomis (žr. components/SiteFooter.tsx nuorodų sąrašą), kad neduotume
// pažadų, kurių Platforma nevykdo.

import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalLayout } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Apie mus — Music.lt',
  description: 'Music.lt — Lietuvos muzikos ekosistemos platforma: atlikėjų katalogas, naujienos, topai, koncertai ir bendruomenė vienoje vietoje.',
  alternates: { canonical: '/apie-mus' },
  robots: { index: true, follow: true },
}

const HIGHLIGHTS = [
  { icon: '🎤', title: 'Atlikėjų katalogas', body: 'Tūkstančiai lietuviškų ir užsienio atlikėjų profilių — diskografija, biografija ir socialinių tinklų nuorodos vienoje vietoje.' },
  { icon: '📰', title: 'Naujienos ir topai', body: 'Kasdien atnaujinamos muzikos naujienos bei topų sąrašai — lietuviškos ir pasaulio scenos kontekste.' },
  { icon: '🎟️', title: 'Koncertai', body: 'Artėjančių koncertų ir renginių kalendorius, kad nepraleistumėte savo mėgstamo atlikėjo pasirodymo.' },
  { icon: '💬', title: 'Bendruomenė', body: 'Diskusijos, narių blog’ai, „Dienos daina“ balsavimai ir muzikos atradimai — vieta pasidalyti nuomone su kitais klausytojais.' },
  { icon: '🚀', title: 'Erdvė atlikėjams', body: 'Atlikėjai gali perimti savo profilį, jį redaguoti, bendrauti su fanais ir sekti statistiką — nemokamai.' },
]

export default function AboutPage() {
  return (
    <LegalLayout
      eyebrow="Music.lt"
      title="Apie mus"
      intro="Music.lt — Lietuvos muzikos ekosistemos platforma, jungianti atlikėjus, klausytojus ir naujienas vienoje vietoje."
    >
      <p>
        Music.lt siekia būti centrine vieta viskam, kas susiję su lietuviška (ir ne tik) muzika: nuo
        naujausio singlo iki artimiausio koncerto, nuo atlikėjo biografijos iki bendruomenės diskusijos
        apie jį. Vietoj to, kad ši informacija būtų išbarstyta po dešimtis skirtingų šaltinių, sutelkiame
        ją į vieną, nuolat atnaujinamą platformą.
      </p>

      <h2>Ką rasite Music.lt</h2>
      <div className="not-prose grid gap-4 sm:grid-cols-2 my-6">
        {HIGHLIGHTS.map((h) => (
          <div
            key={h.title}
            className="rounded-2xl p-4"
            style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
          >
            <div className="text-xl mb-2">{h.icon}</div>
            <h3 className="font-['Outfit',sans-serif] text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{h.title}</h3>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{h.body}</p>
          </div>
        ))}
      </div>

      <h2>Bendruomenės pagrindu</h2>
      <p>
        Music.lt turinį formuoja ne tik redakcija, bet ir patys naudotojai — per narių rašomus blog’us,
        diskusijas, „Dienos daina“ balsavimus ir muzikos atradimus. Tikime, kad geriausias muzikos
        kontekstas gimsta iš pačios bendruomenės.
      </p>

      <h2>Atlikėjams</h2>
      <p>
        Jei esate atlikėjas ar atstovaujate atlikėją, galite perimti savo profilį ir jį patys tvarkyti —
        redaguoti bio, nuotraukas, dalintis naujienomis su savo fanais ir matyti realią statistiką.
        Plačiau: <Link href="/atlikejams">Music.lt atlikėjams</Link>.
      </p>

      <h2>Susisiekite</h2>
      <p>
        Turite klausimų, pasiūlymų ar radote klaidą? Rašykite mums per <Link href="/kontaktai">Kontaktų puslapį</Link>.
      </p>
    </LegalLayout>
  )
}
