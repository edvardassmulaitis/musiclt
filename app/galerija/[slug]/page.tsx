// app/galerija/[slug]/page.tsx
//
// Foto reportažo detalė — editorial įžanga + nuotraukų galerija (lightbox) +
// fotografo / atlikėjo nuorodos. Kanoninis reportažo URL. Žr. lib/galerija.ts.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getReportageBySlug, formatEventDate, reportagePlaceLine } from '@/lib/galerija'
import { photographerHref } from '@/lib/galerija-shared'
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
  const { reportage: r, photos } = res
  const place = reportagePlaceLine(r)
  const date = formatEventDate(r.eventDate)

  return (
    <div className="page-shell">
      {/* Atgal */}
      <Link href="/galerija" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-muted)] no-underline hover:text-[#ec4899]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Foto galerija
      </Link>

      <header className="page-head">
        <div className="mb-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ec4899]">
          Foto reportažas
        </div>
        <h1>{cleanTitle(r.title)}</h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[var(--text-muted)]">
          {r.artistName && (
            r.artistSlug ? (
              <Link href={`/atlikejai/${r.artistSlug}`} className="font-semibold text-[var(--text-secondary)] no-underline hover:text-[#ec4899]">
                {r.artistName}
              </Link>
            ) : <span className="font-semibold text-[var(--text-secondary)]">{r.artistName}</span>
          )}
          {place && <span>{place}</span>}
          {date && <span>{date}</span>}
          {photos.length > 0 && <span>📸 {photos.length} nuotraukos</span>}
        </div>
      </header>

      {/* Editorial įžanga */}
      {r.intro && (
        <div
          className="mb-7 max-w-3xl text-[15.5px] leading-[1.7] text-[var(--text-secondary)] [&_a]:text-[#ec4899] [&_a:hover]:underline [&_p]:mb-3.5"
          dangerouslySetInnerHTML={{ __html: r.intro }}
        />
      )}

      {/* Fotografo kreditas */}
      {r.photographerName && (
        <div className="mb-7 flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
          <span className="text-[13.5px] text-[var(--text-secondary)]">
            Nuotraukos:{' '}
            {r.photographerSlug ? (
              <Link href={photographerHref(r.photographerSlug)} className="font-bold text-[var(--text-primary)] no-underline hover:text-[#ec4899]">
                {r.photographerName}
              </Link>
            ) : (
              <span className="font-bold text-[var(--text-primary)]">{r.photographerName}</span>
            )}
          </span>
        </div>
      )}

      {/* Galerija */}
      {photos.length > 0 ? (
        <ReportageGallery photos={photos} photographerName={r.photographerName} />
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
