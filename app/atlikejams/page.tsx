// app/atlikejams/page.tsx — pristatymo (landing) puslapis atlikėjams.
// Vieša, SEO. CTA pritaikomas pagal tai, ar vartotojas jau valdo atlikėją.
import Link from 'next/link'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { getTeamArtists } from '@/lib/artist-studio'
import { createAdminClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Music.lt atlikėjams — valdyk savo profilį ir fanus',
  description: 'Pasiimk savo atlikėjo profilį Music.lt: redaguok bio ir nuotraukas, augink fanų ratą, siųsk jiems naujienas ir matyk realią statistiką. Nemokama.',
  alternates: { canonical: 'https://music.lt/atlikejams' },
}

const FEATURES = [
  { icon: '✏️', title: 'Tavo profilis — tavo kontrolė', body: 'Redaguok bio (su AI pagalba), nuotraukas, žanrus ir visas socialines nuorodas. Tu sprendi, kaip atrodai.' },
  { icon: '📷', title: 'Socialiniai postai vienoje vietoje', body: 'Įklijuok Instagram, TikTok, YouTube ar Facebook posto nuorodą — jie atsiras tiesiai tavo anketoje.' },
  { icon: '❤️', title: 'Fanų bazė, kuri priklauso tau', body: 'Žmonės seka tave Music.lt — ir tu gali jiems parašyti tiesiogiai. Be algoritmų, kurie slepia tavo žinutę.' },
  { icon: '✉️', title: 'Žinutės apie naujienas', body: 'Naujas singlas? Koncertas? Paskelbk — sekėjai gaus pranešimą iškart. El. laiškai jau netrukus.' },
  { icon: '📊', title: 'Statistika, kurios neturi kitur', body: 'Kiek žmonių lankėsi, kaip auga fanų ratas, kas labiausiai klausoma — lietuviškai ir konkrečiai.' },
  { icon: '🚀', title: 'Atradimas dirba už tave', body: 'Topai, naujų atlikėjų radaras ir naujienos atveda naujų klausytojų — nemokamai, be reklamos biudžeto.' },
]

const STEPS = [
  { n: '1', title: 'Susirask save', body: 'Įvesk savo atlikėjo vardą — greičiausiai jau esi mūsų kataloge.' },
  { n: '2', title: 'Patvirtink, kad čia tu', body: 'Pateik nuorodą į oficialų soc. tinklą. Patikrinsime ir patvirtinsime.' },
  { n: '3', title: 'Valdyk', body: 'Gauni studiją: profilis, fanai, žinutės, statistika — viskas vienoje vietoje.' },
]

export default async function ArtistsLanding() {
  let hasArtist = false
  try {
    const session = await getServerSession(authOptions)
    const profile = await resolveProfile(session)
    if (profile?.id) hasArtist = (await getTeamArtists(profile.id)).length > 0
  } catch { /* svečias */ }

  let artistCount = 0
  try {
    const sb = createAdminClient()
    const { count } = await sb.from('artists').select('*', { count: 'exact', head: true }).eq('is_active', true)
    artistCount = count || 0
  } catch {}

  const primaryHref = hasArtist ? '/atlikejams/studija' : '/atlikejams/studija/prisijungti'
  const primaryLabel = hasArtist ? 'Į mano studiją' : 'Pasiimti profilį'

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[var(--border-subtle)]">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            🎤 Music.lt atlikėjams
          </div>
          <h1 className="mt-5 font-['Outfit',sans-serif] text-3xl font-extrabold leading-tight text-[var(--text-primary)] sm:text-5xl">
            Tavo muzika. Tavo fanai.<br />Tavo profilis.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg">
            Pasiimk savo atlikėjo anketą Music.lt — sutvarkyk ją, augink fanų ratą,
            siųsk jiems naujienas ir matyk, kas iš tikrųjų tave klauso. Nemokama.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={primaryHref} className="rounded-full bg-[var(--accent-orange)] px-7 py-3 text-sm font-semibold text-white">
              {primaryLabel}
            </Link>
            <a href="#kaip" className="rounded-full border border-[var(--border-default)] px-7 py-3 text-sm font-medium text-[var(--text-secondary)]">
              Kaip tai veikia
            </a>
          </div>
          {artistCount > 0 && (
            <p className="mt-5 text-xs text-[var(--text-muted)]">Jau {artistCount.toLocaleString('lt-LT')} atlikėjų kataloge</p>
          )}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="text-center font-['Outfit',sans-serif] text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Ką gali daryti</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5">
              <div className="text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY US */}
      <section className="border-y border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="font-['Outfit',sans-serif] text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Kuo tai geriau už tai, ką jau turi</h2>
          <div className="mt-6 space-y-3 text-left">
            <p className="text-sm text-[var(--text-secondary)]"><b className="text-[var(--text-primary)]">Spotify</b> rodo srautus, bet neleidžia parašyti fanui. <b className="text-[var(--text-primary)]">Mes</b> turim ir muzikinį kontekstą, ir tiesioginį kanalą iki klausytojo.</p>
            <p className="text-sm text-[var(--text-secondary)]"><b className="text-[var(--text-primary)]">Instagram</b> algoritmas paslepia daugumą tavo sekėjų. <b className="text-[var(--text-primary)]">Mes</b> pristatom tavo žinutę visiems, kas tave seka.</p>
            <p className="text-sm text-[var(--text-secondary)]"><b className="text-[var(--text-primary)]">Linktree</b> tik laiko nuorodas. <b className="text-[var(--text-primary)]">Mes</b> dar ir atvedam naujų fanų per topus, radarą ir naujienas.</p>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section id="kaip" className="mx-auto max-w-4xl px-4 py-14">
        <h2 className="text-center font-['Outfit',sans-serif] text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Kaip pradėti</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-[var(--border-subtle)] p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-orange)] font-bold text-white">{s.n}</div>
              <h3 className="mt-3 font-['Outfit',sans-serif] text-base font-bold text-[var(--text-primary)]">{s.title}</h3>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-9 text-center">
          <Link href={primaryHref} className="rounded-full bg-[var(--accent-orange)] px-8 py-3 text-sm font-semibold text-white">
            {primaryLabel}
          </Link>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Nemokama · užtrunka kelias minutes</p>
        </div>
      </section>
    </div>
  )
}
