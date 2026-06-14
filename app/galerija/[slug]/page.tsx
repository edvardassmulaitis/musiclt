// app/galerija/[slug]/page.tsx
//
// Foto reportažo detalė — editorial įžanga + nuotraukų galerija (lightbox) +
// fotografo / atlikėjo nuorodos. Kanoninis reportažo URL. Žr. lib/galerija.ts.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getReportageBySlug, formatEventDate, reportagePlaceLine } from '@/lib/galerija'
import { photographerHref, ltCount } from '@/lib/galerija-shared'
import ReportageGallery from '@/components/galerija/ReportageGallery'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

function cleanTitle(t: string): string {
  return t.replace(/^FOTO\s+(REPORTA[ŽZ]AS|GALERIJA)\s*\|\s*/i, '')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const res = await getReportageBySlug(slug)
  if (!res) return { title: 'Reportažas', robots: { index: false, follow: false } }
  const { reportage: r, photos } = res
  const title = cleanTitle(r.title)
  const desc =
    `Foto reportažas${r.artistName ? ` — ${r.artistName}` : ''}${
      reportagePlaceLine(r) ? `, ${reportagePlaceLine(r)}` : ''
    }${r.photographerName ? `. Fotografas: ${r.photographerName}.` : '.'}`
  const img = photos[0]?.url || r.coverUrl || undefined
  return {
    title: `${title} — foto reportažas · music.lt`,
    description: desc,
    alternates: { canonical: `/galerija/${r.slug}` },
    openGraph: { title, description: desc, images: img ? [img] : undefined, type: 'article' },
  }
}

export default async function ReportagePage({ params }: Props) {
  const { slug } = await params
  const res = await getReportageBySlug(slug)
  if (!res) notFound()
  const { reportage: r, photos, lineup, groups } = res
  const place = reportagePlaceLine(r)
  const date = formatEventDate(r.eventDate)

  const photoCount = photos.length ? ltCount(photos.length, ['nuotrauka', 'nuotraukos', 'nuotraukų']) : null

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {/* Atgal */}
      <Link href="/galerija" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-muted)] no-underline hover:text-[#ec4899]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Foto galerija
      </Link>

      {/* Antraštė — kompaktiška, kad vizualams liktų dėmesys */}
      <header className="mb-6 max-w-4xl">
        <div className="mb-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ec4899]">
          Foto reportažas
        </div>
        <h1 className="font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[36px]">
          {cleanTitle(r.title)}
        </h1>

        {/* Viena meta eilutė: vieta · data · kiekis · fotografas */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-[var(--text-muted)]">
          {r.eventName && <><span className="font-semibold text-[var(--text-secondary)]">{r.eventName}</span><span className="opacity-40">·</span></>}
          {place && <><span>{place}</span><span className="opacity-40">·</span></>}
          {date && <span>{date}</span>}
          {photoCount && <><span className="opacity-40">·</span><span>{photoCount}</span></>}
          {r.photographerName && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                {r.photographerSlug ? (
                  <Link href={photographerHref(r.photographerSlug)} className="font-semibold text-[var(--text-secondary)] no-underline hover:text-[#ec4899]">{r.photographerName}</Link>
                ) : <span className="font-semibold text-[var(--text-secondary)]">{r.photographerName}</span>}
              </span>
            </>
          )}
        </div>

        {/* Line-up — atlikėjai su vaidmenimis */}
        {lineup.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lineup.map((a) => {
              const inner = (
                <>
                  {a.name}
                  {a.role && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#ec4899]">{a.role}</span>}
                </>
              )
              return a.slug ? (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-1 text-[13px] font-semibold text-[var(--text-primary)] no-underline transition-colors hover:border-[#ec4899]/50">
                  {inner}
                </Link>
              ) : (
                <span key={a.id} className="inline-flex items-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-1 text-[13px] font-semibold text-[var(--text-primary)]">
                  {inner}
                </span>
              )
            })}
          </div>
        )}

        {/* Editorial įžanga — kuklesnė, kad neužgožtų vizualų */}
        {r.intro && (
          <div
            className="mt-4 text-[14.5px] leading-[1.65] text-[var(--text-secondary)] [&_a]:text-[#ec4899] [&_a:hover]:underline [&_p]:mb-2.5"
            dangerouslySetInnerHTML={{ __html: r.intro }}
          />
        )}
      </header>

      {/* Galerija — pilno pločio, didelės nuotraukos */}
      {photos.length > 0 ? (
        <ReportageGallery photos={photos} groups={groups} photographerName={r.photographerName} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center text-[14px] text-[var(--text-muted)]">
          Nuotraukos netrukus.
          {r.sourceUrl && (
            <>
              {' '}Originalus reportažas:{' '}
              <a href={r.sourceUrl} target="_blank" rel="noopener" className="text-[#ec4899] hover:underline">music.lt</a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
