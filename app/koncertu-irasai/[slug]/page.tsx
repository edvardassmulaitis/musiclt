// app/koncertu-irasai/[slug]/page.tsx
//
// Vieno koncerto įrašo puslapis — SEO landing (VideoObject JSON-LD) + embed +
// metaduomenys + susiję įrašai. Duomenys: lib/concert-recordings.ts.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE_URL } from '@/lib/artist-browse'
import {
  getRecordingBySlug, getRelatedRecordings, getAllRecordingSlugs,
  recordingTypeLabel, formatDuration, formatRecordedDate, recordingPlaceLine,
  recordingHref, ytEmbedUrl,
} from '@/lib/concert-recordings'

export const revalidate = 900

export async function generateStaticParams() {
  try {
    const slugs = await getAllRecordingSlugs()
    return slugs.slice(0, 200).map((slug) => ({ slug }))
  } catch { return [] }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const rec = await getRecordingBySlug(slug)
  if (!rec) return { title: 'Įrašas nerastas | music.lt' }
  const artistPart = rec.artist_name ? ` — ${rec.artist_name}` : ''
  const title = `${rec.title}${artistPart} | Koncertų įrašai`
  const place = recordingPlaceLine(rec)
  const desc = `${recordingTypeLabel(rec.recording_type)}${place ? ` · ${place}` : ''}. Žiūrėk live pasirodymo vaizdo įrašą music.lt.`
  return {
    title,
    description: desc,
    alternates: { canonical: `${SITE_URL}${recordingHref(rec)}` },
    openGraph: {
      title, description: desc, type: 'video.other',
      url: `${SITE_URL}${recordingHref(rec)}`,
      images: rec.thumbnail_url ? [{ url: rec.thumbnail_url }] : undefined,
    },
  }
}

export default async function RecordingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const rec = await getRecordingBySlug(slug)
  if (!rec) notFound()

  const related = await getRelatedRecordings(rec, 6)
  const place = [rec.venue, rec.city].filter(Boolean).join(', ')
  const dateStr = formatRecordedDate(rec.recorded_on, rec.recorded_year)

  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: rec.title,
    description: (rec.description || `${recordingTypeLabel(rec.recording_type)}${place ? ` — ${place}` : ''}`).slice(0, 500),
    thumbnailUrl: rec.thumbnail_url ? [rec.thumbnail_url] : undefined,
    uploadDate: rec.uploaded_at || undefined,
    contentUrl: rec.youtube_url,
    embedUrl: `https://www.youtube.com/embed/${rec.youtube_id}`,
    ...(rec.view_count != null && { interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: rec.view_count } }),
  }

  return (
    <div className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-3 text-[14px] text-[var(--text-muted)]">
        <Link href="/koncertu-irasai" className="hover:text-[var(--accent-orange)]">Koncertų įrašai</Link>
        {rec.artist_slug && (
          <>
            {' / '}
            <Link href={`/atlikejai/${rec.artist_slug}`} className="hover:text-[var(--accent-orange)]">{rec.artist_name}</Link>
          </>
        )}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <iframe
              src={ytEmbedUrl(rec.youtube_id, false)}
              className="absolute inset-0 h-full w-full"
              title={rec.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--accent-orange)] px-2.5 py-0.5 text-[12px] font-extrabold uppercase tracking-wide text-white">
              {recordingTypeLabel(rec.recording_type)}
            </span>
            {rec.duration_seconds != null && (
              <span className="text-[14px] font-bold tabular-nums text-[var(--text-muted)]">{formatDuration(rec.duration_seconds)}</span>
            )}
            {rec.view_count != null && (
              <span className="text-[14px] text-[var(--text-faint)]">{rec.view_count.toLocaleString('lt-LT')} peržiūrų</span>
            )}
          </div>

          <h1 className="mt-2 font-['Outfit',sans-serif] text-[22px] font-black leading-tight tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px]">
            {rec.title}
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[14px] text-[var(--text-muted)]">
            {rec.artist_slug ? (
              <Link href={`/atlikejai/${rec.artist_slug}`} className="font-bold text-[var(--accent-link)]">{rec.artist_name}</Link>
            ) : rec.artist_name ? <span className="font-bold">{rec.artist_name}</span> : null}
          </div>

          {rec.description && (
            <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-[var(--text-secondary)] line-clamp-[12]">
              {rec.description}
            </p>
          )}
        </div>

        {/* ── Šoninė info ── */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
            <h2 className="mb-2 font-['Outfit',sans-serif] text-[14px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Apie įrašą</h2>
            <dl className="space-y-1.5 text-[14.5px]">
              {place && <InfoRow label="Vieta" value={place} />}
              {dateStr && <InfoRow label="Koncerto data" value={dateStr} />}
              {rec.duration_seconds != null && <InfoRow label="Trukmė" value={formatDuration(rec.duration_seconds)} />}
              {rec.channel && <InfoRow label="Kanalas" value={rec.channel} />}
            </dl>
            <a href={rec.youtube_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[13.5px] font-semibold text-[var(--accent-link)]">
              Žiūrėti YouTube ↗
            </a>
          </div>

          {rec.styles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rec.styles.slice(0, 6).map((s) => (
                <span key={s} className="rounded-full bg-[var(--bg-elevated)] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--text-muted)]">{s}</span>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ── Susiję ── */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-['Outfit',sans-serif] text-[19px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
            Daugiau įrašų
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((r) => (
              <Link key={r.id} href={recordingHref(r)} className="group block">
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--bg-elevated)]">
                  {r.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail_url} alt={r.title} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" referrerPolicy="no-referrer" loading="lazy" />
                  )}
                  {r.duration_seconds != null && (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums text-white">
                      {formatDuration(r.duration_seconds)}
                    </span>
                  )}
                </div>
                <h3 className="mt-1.5 line-clamp-2 text-[14px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--accent-orange)]">{r.title}</h3>
                {r.artist_name && <p className="text-[13px] text-[var(--text-muted)]">{r.artist_name}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-[var(--text-faint)]">{label}</dt>
      <dd className="text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  )
}
