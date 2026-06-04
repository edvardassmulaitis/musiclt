'use client'

import Link from 'next/link'
import { proxyImg } from '@/lib/img-proxy'
import { relativeTime } from '@/lib/relative-time'
import {
  formatPrice, subtypeLabel, labelFor, INSTRUMENTS,
  type Listing,
} from '@/lib/skelbimai'

/* Skelbimo kortelė — naudojama hub'e, kategorijos sąraše, profilyje. */

const PlaceholderIcon = (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
    <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
  </svg>
)

export function ListingCard({ listing }: { listing: Listing }) {
  const price = formatPrice(listing.price_cents, listing.price_unit, listing.is_free)
  const cover = listing.photos?.[0] || null
  const sub = subtypeLabel(listing.type, listing.subtype)
  const instr = labelFor(INSTRUMENTS, listing.instrument)
  const meta: string[] = []
  if (listing.type === 'rysiai') {
    if (listing.looking_for === true) meta.push('Ieško')
    else if (listing.looking_for === false) meta.push('Siūlo')
    if (instr) meta.push(instr)
  }
  if (listing.city) meta.push(listing.city)

  return (
    <Link
      href={`/skelbimai/skelbimas/${listing.id}`}
      style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14, overflow: 'hidden',
        textDecoration: 'none', color: 'inherit',
        transition: 'transform .15s ease, border-color .15s ease',
      }}
      className="listing-card"
    >
      {/* Vaizdas */}
      <div style={{
        position: 'relative', aspectRatio: '4 / 3', background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-faint)',
      }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxyImg(cover, 600)} alt={listing.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        ) : PlaceholderIcon}
        {listing.is_promoted && (
          <span style={{
            position: 'absolute', top: 8, left: 8, fontSize: 11, fontWeight: 700,
            padding: '3px 8px', borderRadius: 999, background: 'rgba(249,115,22,0.92)',
            color: '#fff', letterSpacing: '.02em',
          }}>★ Rekomenduojama</span>
        )}
      </div>

      {/* Turinys */}
      <div style={{ padding: '12px 13px 13px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {sub && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-link)', letterSpacing: '.01em' }}>
            {sub}
          </span>
        )}
        <h3 style={{
          fontSize: 15, fontWeight: 700, lineHeight: 1.25, margin: 0,
          color: 'var(--text-primary)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{listing.title}</h3>

        {price && (
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-green)' }}>{price}</span>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.join(' · ')}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>
            {relativeTime(listing.created_at)}
          </span>
        </div>
      </div>

      <style jsx>{`
        .listing-card:hover { transform: translateY(-2px); border-color: var(--border-strong) !important; }
      `}</style>
    </Link>
  )
}
