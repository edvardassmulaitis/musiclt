// app/galerija/[slug]/page.tsx
//
// Foto reportažo detalė — editorial įžanga + nuotraukų galerija (lightbox) +
// fotografo / atlikėjo nuorodos. Kanoninis reportažo URL. Žr. lib/galerija.ts.

import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getReportageBySlug, getMoreByPhotographer, formatEventDate, reportagePlaceLine } from '@/lib/galerija'
import { photographerHref, ltCount } from '@/lib/galerija-shared'
import ReportageGallery from '@/components/galerija/ReportageGallery'
import ReportageIntro from '@/components/galerija/ReportageIntro'

export const revalidate = 300

type Props = { params: Promise<{ slug: string }> }

function cleanTitle(t: string): string {
  return t
    .replace(/^\s*(FOTO\s*(REPORTA[ŽZ]AS|GALERIJA)|FOTOREPORTA[ŽZ]AS|RENGINIO\s+RECENZIJA|FESTIVALIO\s+(RECENZIJA|AP[ŽZ]VALGA))\b/i, '')
    .replace(/\(\+?\s*(FOTO\s*GALERIJA|foto galerija)\s*\)/i, '')
    .replace(/^[\s|:–—-]+/, '')
    .replace(/[\s|:–—-]+$/, '')
    .trim() || t
}

const NON_HEAD_ROLE: Record<string, string> = { 'apšildantis': 'Apšildantis', 'svečias': 'Svečias' }

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
  // SEO: jei užklausa per seną slug'ą — 301 į kanoninį.
  if (res.reportage.slug !== slug) permanentRedirect(`/galerija/${res.reportage.slug}`)
  const { reportage: r, photos, lineup, groups } = res
  const place = reportagePlaceLine(r)
  const date = formatEventDate(r.eventDate)
  const photoCount = photos.length ? ltCount(photos.length, ['nuotrauka', 'nuotraukos', 'nuotraukų']) : null

  const more = r.photographerId ? await getMoreByPhotographer(r.photographerId, r.id, 8) : []

  const hasExplicitHead = lineup.some((a) => a.role === 'headlineris')
  const isHead = (a: typeof lineup[number], i: number) => a.role === 'headlineris' || (!hasExplicitHead && i === 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <Link href="/galerija" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-muted)] no-underline hover:text-[#ec4899]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Foto galerija
      </Link>

      <header className="mb-6 max-w-4xl">
        <div className="mb-1.5 font-['Outfit',sans-serif] text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#ec4899]">
          Foto reportažas
        </div>
        <h1 className="font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[36px]">
          {cleanTitle(r.title)}
        </h1>

        {/* Meta eilutė: vieta · data · kiekis · fotografas */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13.5px] text-[var(--text-muted)]">
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

        {/* Line-up — headlineris(-iai) didelėmis kortelėmis, kiti maži (be žodžio „headlineris") */}
        {lineup.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {lineup.map((a, i) => {
              const head = isHead(a, i)
              const roleLabel = a.role && NON_HEAD_ROLE[a.role] ? NON_HEAD_ROLE[a.role] : null
              const cls = head
                ? 'group inline-flex items-center gap-2.5 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] py-1.5 pl-1.5 pr-4 shadow-sm transition-colors hover:border-[#ec4899]/60'
                : 'inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-1 transition-colors hover:border-[#ec4899]/50'
              const inner = head ? (
                <>
                  <span className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                    {a.image
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.image} alt="" className="h-full w-full object-cover" />
                      : <span className="font-['Outfit',sans-serif] text-[15px] font-black text-[var(--text-muted)]">{a.name.charAt(0)}</span>}
                  </span>
                  <span className="font-['Outfit',sans-serif] text-[15px] font-extrabold leading-tight text-[var(--text-primary)]">{a.name}</span>
                </>
              ) : (
                <>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">{a.name}</span>
                  {roleLabel && <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{roleLabel}</span>}
                </>
              )
              return a.slug ? (
                <Link key={a.id} href={`/atlikejai/${a.slug}`} className={`${cls} no-underline`}>{inner}</Link>
              ) : (
                <span key={a.id} className={cls}>{inner}</span>
              )
            })}
          </div>
        )}

        {/* Pilnas editorial aprašymas + „Skaityti daugiau" */}
        {r.intro && <ReportageIntro html={r.intro} />}
      </header>

      {photos.length > 0 ? (
        <ReportageGallery photos={photos} groups={groups} photographerName={r.photographerName} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center text-[14px] text-[var(--text-muted)]">
          Nuotraukos netrukus.
          {r.sourceUrl && (
            <>{' '}Originalus reportažas:{' '}
              <a href={r.sourceUrl} target="_blank" rel="noopener" className="text-[#ec4899] hover:underline">music.lt</a>
            </>
          )}
        </div>
      )}

      {/* Daugiau šio fotografo nuotraukų — kiti koncertai */}
      {more.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-['Outfit',sans-serif] text-[19px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
              Daugiau {r.photographerName ? `fotografo ${r.photographerName}` : 'šio fotografo'} nuotraukų
            </h2>
            {r.photographerSlug && (
              <Link href={photographerHref(r.photographerSlug)} className="flex-none text-[13px] font-bold text-[#ec4899] no-underline hover:underline">Visi →</Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {more.map((m) => (
              <Link key={m.id} href={m.href} className="group block overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-colors hover:border-[#ec4899]/50">
                <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--bg-elevated)]">
                  {m.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="line-clamp-2 text-[13px] font-bold leading-tight text-[var(--text-primary)]">{cleanTitle(m.title)}</div>
                  <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                    {[reportagePlaceLine(m), formatEventDate(m.eventDate)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
