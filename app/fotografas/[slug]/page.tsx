// app/fotografas/[slug]/page.tsx
//
// Photographer showcase — a simple grid of every photo attributed to this
// photographer across all artists, with a link back to the artist on each tile.
//
// Why this exists: we just promoted photographers from a caption string to a
// first-class table (20260424c_photographers.sql). A `/fotografas/[slug]`
// page lets us link from the lightbox author name to a portfolio — especially
// valuable for LT photographers who contribute to multiple artists.
//
// Rendering is server-side only (no client interactions yet). Later we can
// add filtering, bio, socials, but this bootstrap is intentionally minimal.

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase'

type Props = { params: Promise<{ slug: string }> }

async function getPhotographer(slug: string) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('photographers')
    .select('id, slug, name, website_url, bio, avatar_url, external_url, source')
    .eq('slug', slug)
    .single()
  return data
}

/** Pull every photo credited to this photographer, joined with its artist so
 *  we can link each tile back. Ordered newest-first by taken_at (null last). */
async function getPhotos(photographerId: number) {
  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_photos')
    .select('id, url, caption, taken_at, source_url, license, artist_id, artists:artist_id(id, slug, name)')
    .eq('photographer_id', photographerId)
    .order('taken_at', { ascending: false, nullsFirst: false })
    .limit(200)
  return (data || []) as any[]
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const p = await getPhotographer(slug)
  if (!p) return { title: 'Fotografas' }
  return {
    title: `${p.name} — fotografas · music.lt`,
    description: p.bio || `${p.name} nuotraukos music.lt`,
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const photographer = await getPhotographer(slug)
  if (!photographer) notFound()

  const photos = await getPhotos(photographer.id)

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 lg:px-10">
      {/* Header */}
      <section className="mb-8 flex items-center gap-4 sm:gap-5">
        {photographer.avatar_url ? (
          <img
            src={photographer.avatar_url}
            alt={photographer.name}
            className="h-16 w-16 rounded-full border border-[var(--border-default)] object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--card-bg)] font-['Outfit',sans-serif] text-[24px] font-black text-[var(--text-muted)] sm:h-20 sm:w-20 sm:text-[28px]">
            {photographer.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-['Outfit',sans-serif] text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Fotografas
          </div>
          <h1 className="font-['Outfit',sans-serif] text-[28px] font-black leading-tight tracking-[-0.01em] text-[var(--text-primary)] sm:text-[32px]">
            {photographer.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-[var(--text-muted)]">
            <span>{photos.length} nuotraukos</span>
            {photographer.website_url && (
              <a
                href={photographer.website_url}
                target="_blank"
                rel="noopener"
                className="text-[var(--accent-orange)] hover:underline"
              >
                Svetainė
              </a>
            )}
            {photographer.external_url && (
              <a
                href={photographer.external_url}
                target="_blank"
                rel="noopener"
                className="text-[var(--accent-orange)] hover:underline"
              >
                {photographer.source === 'wikimedia' ? 'Wikimedia profilis' : 'Profilis'}
              </a>
            )}
          </div>
          {photographer.bio && (
            <p className="mt-3 max-w-3xl text-[14px] leading-[1.6] text-[var(--text-secondary)]">
              {photographer.bio}
            </p>
          )}
        </div>
      </section>

      {/* Photos grid */}
      {photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center text-[14px] text-[var(--text-muted)]">
          Dar nėra nuotraukų.
        </div>
      ) : (
        <div className="columns-2 gap-2 sm:columns-3 md:gap-3 lg:columns-4">
          {photos.map((p) => {
            const artist = (p as any).artists
            const year = p.taken_at ? new Date(p.taken_at).getFullYear() : null
            const href = artist?.slug ? `/atlikejai/${artist.slug}` : null
            const content = (
              <div className="mb-2 block w-full overflow-hidden rounded-xl md:mb-3" style={{ breakInside: 'avoid' }}>
                <div className="relative">
                  <img
                    src={p.url}
                    alt={artist?.name || ''}
                    loading="lazy"
                    className="block w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2.5">
                    {artist?.name && (
                      <div className="truncate font-['Outfit',sans-serif] text-[13px] font-bold text-white drop-shadow">
                        {artist.name}
                      </div>
                    )}
                    {year && (
                      <div className="font-['Outfit',sans-serif] text-[10px] font-bold text-white/70">
                        {year}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
            return href ? (
              <Link key={p.id} href={href} className="group block no-underline">
                {content}
              </Link>
            ) : (
              <div key={p.id} className="group block">{content}</div>
            )
          })}
        </div>
      )}
    </main>
  )
}
