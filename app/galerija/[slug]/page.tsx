// app/galerija/[slug]/page.tsx
//
// Foto reportažo detalė — editorial įžanga + nuotraukų galerija (lightbox) +
// fotografo / atlikėjo nuorodos. Kanoninis reportažo URL. Žr. lib/galerija.ts.

import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getReportageBySlug, getMoreByPhotographer, getReportagePlaylist, formatEventDate, reportagePlaceLine } from '@/lib/galerija'
import { photographerHref, ltCount, genitivasLT } from '@/lib/galerija-shared'
import ReportageGallery from '@/components/galerija/ReportageGallery'
import ReportageIntro from '@/components/galerija/ReportageIntro'
import ReportagePlayer from '@/components/galerija/ReportagePlayer'

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
  // SEO: žmonės ieško „[atlikėjas] koncerto nuotraukos" (Google autocomplete) —
  // tad title/desc naudoja „koncerto nuotraukos", ne „foto reportažas".
  const kw = r.artistName ? `${r.artistName} koncerto nuotraukos` : 'Koncerto nuotraukos'
  const desc =
    `${kw}${reportagePlaceLine(r) ? ` — ${reportagePlaceLine(r)}` : ''}${
      r.eventDate ? `, ${formatEventDate(r.eventDate)}` : ''
    }.${r.photographerName ? ` Fotografas: ${r.photographerName}.` : ''}`
  const img = photos[0]?.url || r.coverUrl || undefined
  return {
    title: `${title} — koncerto nuotraukos · music.lt`,
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
  const { reportage: r, photos, lineup, groups, reviewPost } = res
  const place = reportagePlaceLine(r)
  const date = formatEventDate(r.eventDate)
  const photoCount = photos.length ? ltCount(photos.length, ['nuotrauka', 'nuotraukos', 'nuotraukų']) : null

  const [more, playlist] = await Promise.all([
    r.photographerId ? getMoreByPhotographer(r.photographerId, r.id, 8) : Promise.resolve([]),
    getReportagePlaylist(lineup),
  ])

  const hasExplicitHead = lineup.some((a) => a.role === 'headlineris')
  const isHead = (a: typeof lineup[number], i: number) => a.role === 'headlineris' || (!hasExplicitHead && i === 0)

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-8">
      <header className="min-w-0 max-w-4xl lg:flex-1">
        <Link href="/galerija" className="mb-1.5 inline-flex items-center gap-1 font-['Outfit',sans-serif] text-[16px] font-extrabold uppercase tracking-[0.18em] text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-75">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Koncertų nuotraukos
        </Link>
        <h1 className="font-['Outfit',sans-serif] text-[28px] font-black leading-[1.08] tracking-[-0.02em] text-[var(--text-primary)] sm:text-[36px]">
          {cleanTitle(r.title)}
        </h1>

        {/* Meta eilutė: vieta · data · [kiekis] · ✎autorius · 📷fotografas.
            Mobile — nuotraukų skaičius paslėptas, „Tekstas/Foto" tik ikonos. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-[var(--text-muted)] sm:text-[14px]">
          {place && <span>{place}</span>}
          {date && <><span className="opacity-40">·</span><span>{date}</span></>}
          {photoCount && <span className="hidden items-center gap-x-2.5 sm:inline-flex"><span className="opacity-40">·</span><span>{photoCount}</span></span>}
          {r.authorName && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1" title="Teksto autorius">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                {r.authorUsername ? (
                  <Link href={`/@${r.authorUsername}`} className="font-semibold text-[var(--text-secondary)] no-underline hover:text-[var(--accent-orange)]">{r.authorName}</Link>
                ) : <span className="font-semibold text-[var(--text-secondary)]">{r.authorName}</span>}
              </span>
            </>
          )}
          {r.photographerName && (
            <>
              <span className="opacity-40">·</span>
              <span className="inline-flex items-center gap-1" title="Fotografas">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
                {r.photographerUsername ? (
                  <Link href={`/@${r.photographerUsername}`} className="font-semibold text-[var(--text-secondary)] no-underline hover:text-[var(--accent-orange)]">{r.photographerName}</Link>
                ) : r.photographerSlug ? (
                  <Link href={photographerHref(r.photographerSlug)} className="font-semibold text-[var(--text-secondary)] no-underline hover:text-[var(--accent-orange)]">{r.photographerName}</Link>
                ) : <span className="font-semibold text-[var(--text-secondary)]">{r.photographerName}</span>}
              </span>
            </>
          )}
        </div>

        {/* Line-up — headlineris(-iai) didelėmis kortelėmis, kiti maži (be žodžio „headlineris"). Mobile — kompaktiškesni. */}
        {lineup.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-2.5">
            {lineup.map((a, i) => {
              const head = isHead(a, i)
              const roleLabel = a.role && NON_HEAD_ROLE[a.role] ? NON_HEAD_ROLE[a.role] : null
              const cls = head
                ? 'group inline-flex items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--card-bg)] py-1 pl-1 pr-3 shadow-sm transition-colors hover:border-[var(--accent-orange)]/60 sm:gap-2.5 sm:py-1.5 sm:pl-1.5 sm:pr-4'
                : 'inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] px-2.5 py-1 transition-colors hover:border-[var(--accent-orange)]/50 sm:px-3'
              const inner = head ? (
                <>
                  <span className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-full bg-[var(--bg-elevated)] sm:h-11 sm:w-11">
                    {a.image
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.image} alt="" className="h-full w-full object-cover" />
                      : <span className="font-['Outfit',sans-serif] text-[14px] font-black text-[var(--text-muted)] sm:text-[16px]">{a.name.charAt(0)}</span>}
                  </span>
                  <span className="font-['Outfit',sans-serif] text-[16px] font-extrabold leading-tight text-[var(--text-primary)] sm:text-[16px]">{a.name}</span>
                </>
              ) : (
                <>
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] sm:text-[14px]">{a.name}</span>
                  {roleLabel && <span className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{roleLabel}</span>}
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

        {/* Thread C 3b: nuoroda į susietą narių recenzijos įrašą */}
        {reviewPost && (
          <Link href={`/blogas/${reviewPost.blogSlug}/${reviewPost.slug}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3.5 py-1.5 text-[14px] font-semibold text-[var(--text-primary)] hover:border-[var(--accent-orange)] hover:text-[var(--accent-orange)] transition-colors">
            📖 Skaityti recenziją
          </Link>
        )}
      </header>

      {playlist.length > 0 && (
        <aside className="mt-5 lg:mt-0 lg:w-[340px] lg:flex-none">
          <ReportagePlayer items={playlist} />
        </aside>
      )}
      </div>{/* flex: antraštė + grotuvas */}

      {/* Galerija — PILNAS plotis, po antrašte ir grotuvu */}
      <div className="mt-8">
        {photos.length > 0 ? (
          <ReportageGallery photos={photos} groups={groups} photographerName={r.photographerName} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center text-[14px] text-[var(--text-muted)]">
            Nuotraukos netrukus.
            {r.sourceUrl && (
              <>{' '}Originalus reportažas:{' '}
                <a href={r.sourceUrl} target="_blank" rel="noopener" className="text-[var(--accent-orange)] hover:underline">music.lt</a>
              </>
            )}
          </div>
        )}
      </div>

      {/* Daugiau šio fotografo nuotraukų — kiti koncertai */}
      {more.length > 0 && (
        <section className="mt-14">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-['Outfit',sans-serif] text-[20px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
              Daugiau {r.photographerName ? `fotografo ${genitivasLT(r.photographerName)}` : 'šio fotografo'} nuotraukų
            </h2>
            {r.photographerSlug && (
              <Link href={photographerHref(r.photographerSlug)} className="flex-none text-[14px] font-bold text-[var(--accent-orange)] no-underline hover:underline">Visi →</Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {more.map((m) => (
              <Link key={m.id} href={m.href} className="group block overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-colors hover:border-[var(--accent-orange)]/50">
                <div className="aspect-[4/3] w-full overflow-hidden bg-[var(--bg-elevated)]">
                  {m.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="line-clamp-2 text-[14px] font-bold leading-tight text-[var(--text-primary)]">{cleanTitle(m.title)}</div>
                  <div className="mt-1 text-[14px] text-[var(--text-muted)]">
                    {[reportagePlaceLine(m), formatEventDate(m.eventDate)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Nuoroda į visas galerijas — apačioje (vietoj viršuje buvusios) */}
      <div className="mt-12 border-t border-[var(--border-default)] pt-6 text-center">
        <Link href="/galerija" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-[var(--accent-orange)] no-underline hover:underline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          Visos foto galerijos
        </Link>
      </div>
    </div>
  )
}
