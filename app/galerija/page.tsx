// app/galerija/page.tsx
//
// Foto galerija — koncertų / festivalių foto reportažų hub'as. Server-rendered
// (ISR), naujausi reportažai + curated fotografų direktorija. Žr. lib/galerija.ts.

import type { Metadata } from 'next'
import Link from 'next/link'
import { getLatestReportages, getCuratedPhotographers, formatEventDate, reportagePlaceLine } from '@/lib/galerija'
import { ReportageCard } from '@/components/galerija/ReportageCard'
import { PhotographerCard } from '@/components/galerija/PhotographerCard'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Koncertų nuotraukos — foto reportažai · music.lt',
  description:
    'Koncertų ir festivalių nuotraukos iš Lietuvos muzikos scenos. Gyvų pasirodymų akimirkos, užfiksuotos mūsų fotografų.',
  alternates: { canonical: '/galerija' },
}

export default async function GalleryPage() {
  const [reportages, photographers] = await Promise.all([
    getLatestReportages(60),
    getCuratedPhotographers(),
  ])

  const [hero, ...rest] = reportages

  return (
    <div className="page-shell">
      <header className="page-head">
        <h1>Koncertų nuotraukos</h1>
        <p>Foto reportažai iš koncertų ir festivalių — gyvų pasirodymų akimirkos, užfiksuotos mūsų fotografų.</p>
      </header>

      {reportages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-12 text-center">
          <div className="text-[16px] font-semibold text-[var(--text-primary)]">Reportažų dar nėra</div>
          <p className="mx-auto mt-1.5 max-w-sm text-[14px] text-[var(--text-muted)]">
            Netrukus čia atsiras koncertų foto reportažai. Tuo tarpu užsuk į{' '}
            <Link href="/koncertai" className="text-[var(--accent-orange)] hover:underline">koncertus</Link>.
          </p>
        </div>
      ) : (
        <>
          {/* Hero — naujausias / featured reportažas */}
          {hero && (
            <Link
              href={hero.href}
              className="group mb-9 grid gap-0 overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-shadow hover:shadow-xl md:grid-cols-[1.4fr_1fr]"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-elevated)] md:aspect-auto">
                {hero.coverUrl ? (
                  <img src={hero.coverUrl} alt={hero.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[var(--accent-orange)]/20 to-[#8b5cf6]/20" />
                )}
                {hero.photoCount > 0 && (
                  <span className="absolute left-4 top-4 rounded-full bg-black/65 px-3 py-1 text-[14px] font-bold text-white backdrop-blur">
                    📸 {hero.photoCount} nuotraukos
                  </span>
                )}
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <div className="mb-2 font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)]">
                  Koncerto nuotraukos
                </div>
                <h2 className="font-['Outfit',sans-serif] text-[22px] font-black leading-tight tracking-[-0.01em] text-[var(--text-primary)] sm:text-[26px]">
                  {hero.title.replace(/^FOTO\s+(REPORTA[ŽZ]AS|GALERIJA)\s*\|\s*/i, '')}
                </h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-[var(--text-muted)]">
                  {hero.artistName && <span className="font-semibold text-[var(--text-secondary)]">{hero.artistName}</span>}
                  {reportagePlaceLine(hero) && <span>{reportagePlaceLine(hero)}</span>}
                  {formatEventDate(hero.eventDate) && <span>{formatEventDate(hero.eventDate)}</span>}
                </div>
                {hero.photographerName && (
                  <div className="mt-2 text-[14px] text-[var(--text-secondary)]">
                    Fotografas: <span className="font-semibold">{hero.photographerName}</span>
                  </div>
                )}
              </div>
            </Link>
          )}

          {/* Reportažų tinklelis */}
          {rest.length > 0 && (
            <section className="mb-12">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
                {rest.map((r) => (
                  <ReportageCard key={r.id} r={r} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Fotografų direktorija */}
      {photographers.length > 0 && (
        <section className="mt-2">
          <h2 className="mb-3 font-['Outfit',sans-serif] text-[20px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
            Mūsų fotografai
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photographers.map((p) => (
              <PhotographerCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
