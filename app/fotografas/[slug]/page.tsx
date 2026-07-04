// app/fotografas/[slug]/page.tsx
//
// Fotografo profilis — header (avataras, bio, socialiniai tinklai), jo foto
// reportažai (/galerija) ir nuotraukos, kredituotos jam per atlikėjus.
//
// Curated fotografai (is_curated=true, mūsų komanda) indeksuojami; likę 515 —
// Wikimedia auto-atribucijos — lieka noindex (žr. lib/galerija.ts komentarą).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'
import { proxyImgResized } from '@/lib/img-proxy'
import { getPhotographerBySlug, formatEventDate, reportagePlaceLine, ltCount } from '@/lib/galerija'
import { ReportageCard } from '@/components/galerija/ReportageCard'

type Props = { params: Promise<{ slug: string }> }

/** Nuotraukos, kredituotos fotografui per atlikėjus (legacy artist_photos). */
async function getArtistPhotos(photographerId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_photos')
    .select('id, url, caption, taken_at, artist_id, artists:artist_id(id, slug, name)')
    .eq('photographer_id', photographerId)
    .order('taken_at', { ascending: false, nullsFirst: false })
    .limit(200)
  return (data || []) as any[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const res = await getPhotographerBySlug(slug)
  if (!res) return { title: 'Fotografas', robots: { index: false, follow: false } }
  const { photographer: p, isCurated } = res
  return {
    title: `${p.name} — fotografas · music.lt`,
    description: p.bio || `${p.name} — koncertų foto reportažai music.lt`,
    alternates: { canonical: `/fotografas/${p.slug}` },
    // Tik curated fotografus indeksuojam — likę = Wikimedia auto šiukšlės.
    robots: isCurated ? undefined : { index: false, follow: true },
  }
}

const SOCIAL = (label: string, href: string) => (
  <a key={href} href={href} target="_blank" rel="noopener" className="text-[14px] font-semibold text-[#ec4899] no-underline hover:underline">
    {label}
  </a>
)

export default async function Page({ params }: Props) {
  const { slug } = await params
  const res = await getPhotographerBySlug(slug)
  if (!res) notFound()
  const { photographer: p, reportages } = res
  const photos = await getArtistPhotos(p.id)

  const socials = [
    p.websiteUrl && SOCIAL('Svetainė', p.websiteUrl),
    p.instagramUrl && SOCIAL('Instagram', p.instagramUrl),
    p.facebookUrl && SOCIAL('Facebook', p.facebookUrl),
    p.flickrUrl && SOCIAL('Flickr', p.flickrUrl),
  ].filter(Boolean)

  const [featured, ...restReportages] = reportages

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-9 flex items-center gap-4 sm:gap-5">
        {p.avatarUrl ? (
          <img src={p.avatarUrl} alt={p.name} className="h-20 w-20 flex-none rounded-full border border-[var(--border-default)] object-cover sm:h-24 sm:w-24" />
        ) : (
          <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#ec4899] to-[#8b5cf6] font-['Outfit',sans-serif] text-[30px] font-black text-white sm:h-24 sm:w-24">
            {p.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-['Outfit',sans-serif] text-[12px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Fotografas
          </div>
          <h1 className="font-['Outfit',sans-serif] text-[28px] font-black leading-tight tracking-[-0.01em] text-[var(--text-primary)] sm:text-[34px]">
            {p.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px] text-[var(--text-muted)]">
            {reportages.length > 0 && <span>{ltCount(reportages.length, ['reportažas', 'reportažai', 'reportažų'])}</span>}
            {photos.length > 0 && <span>{ltCount(photos.length, ['nuotrauka', 'nuotraukos', 'nuotraukų'])}</span>}
            {socials}
          </div>
          {p.bio && (
            <p className="mt-3 max-w-2xl text-[14px] leading-[1.6] text-[var(--text-secondary)]">{p.bio}</p>
          )}
        </div>
      </header>

      {/* Reportažai — naujausias didelis, likę tinklelyje */}
      {reportages.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 font-['Outfit',sans-serif] text-[20px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
            Foto reportažai
          </h2>

          {featured && (
            <Link href={featured.href} className="group mb-4 block overflow-hidden rounded-3xl border border-[var(--border-default)] bg-[var(--card-bg)] no-underline transition-shadow hover:shadow-xl">
              <div className="relative aspect-[16/8] overflow-hidden bg-[var(--bg-elevated)]">
                {featured.coverUrl && <img src={featured.coverUrl} alt={featured.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                {featured.photoCount > 0 && (
                  <span className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[14px] font-bold text-white backdrop-blur">📸 {featured.photoCount}</span>
                )}
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  {featured.artistName && <div className="mb-1 font-['Outfit',sans-serif] text-[14px] font-extrabold uppercase tracking-[0.14em] text-[#ec4899]">{featured.artistName}</div>}
                  <h3 className="font-['Outfit',sans-serif] text-[22px] font-black leading-tight text-white drop-shadow sm:text-[26px]">
                    {featured.title.replace(/^FOTO\s+(REPORTA[ŽZ]AS|GALERIJA)\s*\|\s*/i, '')}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[14px] text-white/80">
                    {reportagePlaceLine(featured) && <span>{reportagePlaceLine(featured)}</span>}
                    {formatEventDate(featured.eventDate) && <><span className="opacity-50">·</span><span>{formatEventDate(featured.eventDate)}</span></>}
                  </div>
                </div>
              </div>
            </Link>
          )}

          {restReportages.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {restReportages.map((r) => (
                <ReportageCard key={r.id} r={r} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Atlikėjų nuotraukos (legacy artist_photos) */}
      {photos.length > 0 && (
        <section>
          <h2 className="mb-3 font-['Outfit',sans-serif] text-[20px] font-black tracking-[-0.01em] text-[var(--text-primary)]">
            Nuotraukos
          </h2>
          <div className="[column-gap:10px] columns-2 sm:columns-3 lg:columns-4">
            {photos.map((ph) => {
              const artist = ph.artists
              const year = ph.taken_at ? new Date(ph.taken_at).getFullYear() : null
              const href = artist?.slug ? `/atlikejai/${artist.slug}` : null
              const content = (
                <div className="mb-2.5 block w-full overflow-hidden rounded-xl" style={{ breakInside: 'avoid' }}>
                  <div className="relative">
                    <img src={proxyImgResized(ph.url, 500)} alt={artist?.name || ''} loading="lazy" className="block w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                    {artist?.name && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-2.5">
                        <div className="truncate font-['Outfit',sans-serif] text-[14px] font-bold text-white drop-shadow">{artist.name}</div>
                        {year && <div className="font-['Outfit',sans-serif] text-[12px] font-bold text-white/70">{year}</div>}
                      </div>
                    )}
                  </div>
                </div>
              )
              return href ? (
                <Link key={ph.id} href={href} className="group block no-underline">{content}</Link>
              ) : (
                <div key={ph.id} className="group block">{content}</div>
              )
            })}
          </div>
        </section>
      )}

      {reportages.length === 0 && photos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center text-[14px] text-[var(--text-muted)]">
          Dar nėra reportažų.
        </div>
      )}
    </div>
  )
}
