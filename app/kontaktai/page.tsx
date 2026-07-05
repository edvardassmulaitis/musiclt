// app/kontaktai/page.tsx
//
// Kontaktų puslapis. Sąmoningai be tiesioginio formos->backend srauto (kad
// neatidarytume neautentifikuoto viešo POST endpoint'o be spam apsaugos) —
// tiesioginiai mailto: kanalai pagal užklausos tipą. Adresas
// music.lt.naujienos@gmail.com jau realiai naudojamas kaip siunčiantis
// (žr. lib/gmail-send.ts) — jei nori kito adreso, pakeisti čia.

import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalLayout } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Kontaktai — Music.lt',
  description: 'Susisiekite su Music.lt komanda — bendri klausimai, atlikėjams, klaidų pranešimai ir žiniasklaida.',
  alternates: { canonical: '/kontaktai' },
  robots: { index: true, follow: true },
}

const CONTACT_EMAIL = 'music.lt.naujienos@gmail.com'

const CHANNELS = [
  {
    icon: '✉️',
    title: 'Bendri klausimai',
    body: 'Pasiūlymai, klausimai apie platformą ar bendradarbiavimas.',
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Bendras klausimas — Music.lt')}`,
    label: CONTACT_EMAIL,
  },
  {
    icon: '🎤',
    title: 'Atlikėjams',
    body: 'Norite perimti savo atlikėjo profilį ar turite klausimų apie jo valdymą?',
    href: '/atlikejams',
    label: 'Music.lt atlikėjams →',
  },
  {
    icon: '🐞',
    title: 'Klaidos ir netikslumai',
    body: 'Radote neteisingą informaciją, sugedusią nuorodą ar techninę klaidą?',
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Pranešimas apie klaidą — Music.lt')}`,
    label: CONTACT_EMAIL,
  },
  {
    icon: '🔒',
    title: 'Privatumas ir duomenys',
    body: 'Klausimai dėl asmens duomenų tvarkymo ar prašymas ištrinti paskyrą.',
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Privatumo užklausa — Music.lt')}`,
    label: CONTACT_EMAIL,
  },
]

export default function ContactPage() {
  return (
    <LegalLayout
      eyebrow="Susisiekite"
      title="Kontaktai"
      intro="Pasirinkite tinkamiausią kanalą žemiau — stengiamės atsakyti kuo greičiau."
    >
      <div className="not-prose grid gap-4 sm:grid-cols-2 mb-8">
        {CHANNELS.map((c) => (
          <Link
            key={c.title}
            href={c.href}
            className="block rounded-2xl p-4 transition-colors"
            style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}
          >
            <div className="text-xl mb-2">{c.icon}</div>
            <h3 className="font-['Outfit',sans-serif] text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{c.title}</h3>
            <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--text-secondary)' }}>{c.body}</p>
            <span className="text-sm font-medium" style={{ color: 'var(--accent-orange)' }}>{c.label}</span>
          </Link>
        ))}
      </div>

      <h2>Redakcijai / žiniasklaidai</h2>
      <p>
        Dėl naujienų, pranešimų spaudai ar bendradarbiavimo su redakcija rašykite adresu{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Kitos naudingos nuorodos</h2>
      <ul>
        <li><Link href="/apie-mus">Apie mus</Link></li>
        <li><Link href="/privatumo-politika">Privatumo politika</Link></li>
        <li><Link href="/naudojimo-salygos">Naudojimo sąlygos</Link></li>
      </ul>
    </LegalLayout>
  )
}
