import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'
import { proxyImg } from '@/lib/img-proxy'
import { absoluteDate } from '@/lib/relative-time'
import { ListingActions } from '@/components/skelbimai/ListingActions'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import {
  getListing, listByAuthor, isSaved,
  formatPrice, subtypeLabel, labelFor,
  LISTING_TYPES, INSTRUMENTS, EXPERIENCE, CONDITIONS, ITEM_CONDITIONS,
} from '@/lib/skelbimai'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const l = await getListing(id)
  if (!l) return { title: 'Skelbimas nerastas — music.lt' }
  return {
    title: `${l.title} — ${LISTING_TYPES[l.type].label} | Skelbimai`,
    description: l.description?.slice(0, 160) || LISTING_TYPES[l.type].desc,
    openGraph: l.photos?.[0] ? { images: [l.photos[0]] } : undefined,
  }
}

export default async function ListingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  if (!listing || listing.status === 'hidden') notFound()

  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const viewerId = session ? await resolveAuthorId(sb, session) : null
  const isAuthed = !!viewerId
  const isOwner = viewerId === listing.author_id

  const [saved, others] = await Promise.all([
    viewerId ? isSaved(listing.id, viewerId) : Promise.resolve(false),
    listByAuthor(listing.author_id, listing.id, 6),
  ])

  const meta = LISTING_TYPES[listing.type]
  const price = formatPrice(listing.price_cents, listing.price_unit, listing.is_free)
  const author = listing.author
  const authorName = author?.full_name || author?.username || 'Vartotojas'
  const authorHref = author?.username ? `/@${author.username}` : null

  // Detalių eilutės pagal tipą
  const rows: Array<[string, string | null]> = []
  rows.push(['Kategorija', meta.label])
  rows.push(['Potipis', subtypeLabel(listing.type, listing.subtype)])
  if (listing.type === 'rysiai') {
    rows.push(['Kryptis', listing.looking_for === true ? 'Ieško' : listing.looking_for === false ? 'Siūlo' : null])
    rows.push(['Instrumentas', labelFor(INSTRUMENTS, listing.instrument)])
    rows.push(['Patirtis', labelFor(EXPERIENCE, listing.experience)])
    rows.push(['Žanras', listing.genre])
  }
  if (listing.type === 'ploksteles') {
    rows.push(['Formatas', listing.format])
    rows.push(['Media būklė', labelFor(CONDITIONS, listing.media_cond)])
    rows.push(['Voko būklė', labelFor(CONDITIONS, listing.sleeve_cond)])
    rows.push(['Metai', listing.release_year ? String(listing.release_year) : null])
    rows.push(['Šalis', listing.release_country])
    rows.push(['Katalogo nr.', listing.catalog_no])
  }
  if (listing.type === 'instrumentai') {
    rows.push(['Gamintojas', listing.brand])
    rows.push(['Modelis', listing.model])
    rows.push(['Būklė', labelFor(ITEM_CONDITIONS, listing.item_cond)])
    rows.push(['Metai', listing.item_year ? String(listing.item_year) : null])
  }
  rows.push(['Vieta', listing.city])
  const filledRows = rows.filter(([, v]) => !!v) as Array<[string, string]>

  const photos = listing.photos || []

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '24px 20px 80px' }}>
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <Link href={`/skelbimai/${meta.slug}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{meta.label}</Link>
      </nav>

      <div style={{ display: 'grid', gap: 28, gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)' }} className="sk-detail-grid">
        {/* Kairė: galerija + aprašymas */}
        <div>
          {photos.length > 0 ? (
            <div style={{ marginBottom: 20 }}>
              <div style={{ borderRadius: 14, overflow: 'hidden', background: 'var(--bg-surface)', marginBottom: photos.length > 1 ? 8 : 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proxyImg(photos[0], 1000)} alt={listing.title} style={{ width: '100%', maxHeight: 480, objectFit: 'contain', display: 'block' }} />
              </div>
              {photos.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {photos.slice(1).map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={proxyImg(p, 240)} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-subtle)' }} />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.2 }}>
            {listing.title}
          </h1>
          {price && <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent-green)', marginBottom: 16 }}>{price}</div>}

          {listing.description && (
            <div style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginBottom: 24 }}>
              {listing.description}
            </div>
          )}

          {/* Detalės */}
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
            {filledRows.map(([k, v], i) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 14px',
                background: i % 2 ? 'transparent' : 'var(--bg-elevated)', fontSize: 14,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Katalogo blokas (plokštelėms) */}
          {listing.album_id && (
            <Link href={`/albumai/${listing.album_id}`} style={{
              display: 'block', marginTop: 16, padding: '14px 16px', borderRadius: 12,
              border: '1px solid var(--border-default)', background: 'var(--bg-elevated)',
              textDecoration: 'none', color: 'var(--accent-link)', fontWeight: 700, fontSize: 14,
            }}>
              → Šis leidimas music.lt kataloge
            </Link>
          )}
        </div>

        {/* Dešinė: veiksmai + autorius */}
        <aside>
          <div style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ListingActions
              listingId={listing.id}
              authorId={listing.author_id}
              isAuthed={isAuthed}
              isOwner={isOwner}
              initialSaved={saved}
              title={listing.title}
              sourceUrl={listing.source_url}
              sourceName={listing.source_name}
            />

            {/* Autoriaus blokas */}
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: others.length ? 12 : 0 }}>
                {author?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proxyImg(author.avatar_url, 96)} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--text-secondary)' }}>
                    {authorName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  {authorHref ? (
                    <Link href={authorHref} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>{authorName}</Link>
                  ) : (
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{authorName}</span>
                  )}
                  <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Įdėta {absoluteDate(listing.created_at)}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Kiti autoriaus skelbimai */}
      {others.length > 0 && (
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px' }}>Kiti šio autoriaus skelbimai</h2>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {others.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      <style>{`
        @media (max-width: 760px) {
          .sk-detail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
