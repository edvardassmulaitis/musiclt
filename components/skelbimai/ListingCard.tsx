'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { proxyImg } from '@/lib/img-proxy'
import { relativeTime } from '@/lib/relative-time'
import {
  formatPrice, subtypeLabel, labelFor, INSTRUMENTS,
  type Listing, type ListingType,
} from '@/lib/skelbimai'

/* Skelbimo kortelė — naudojama hub'e, kategorijos sąraše, profilyje.
 * Vizualas: jei nėra nuotraukos, rodom potipiui būdingą ikoną (gitara,
 * pianinas, vinilas...). Įrašams be foto — atlikėjo viršelis. */

const sv = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

// Pagal subtype (jei nėra — pagal type)
const SUBTYPE_ICON: Record<string, ReactNode> = {
  // instrumentai
  gitaros: sv(<><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12" /></>),
  bosines: sv(<><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /></>),
  bugnai: sv(<><ellipse cx="12" cy="9" rx="9" ry="4" /><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9" /><path d="m6 12 -3 8" /><path d="m18 12 3 8" /></>),
  klavisiniai: sv(<><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 6v8M10 6v8M14 6v8M18 6v8" /></>),
  puciamieji: sv(<><path d="M3 11h13a4 4 0 0 1 0 8H8" /><circle cx="7" cy="15" r="1" /><circle cx="11" cy="15" r="1" /></>),
  styginiai: sv(<><path d="M11 2 5 22M13 2l6 20" /><path d="M7 12h10" /></>),
  'garso-technika': sv(<><rect x="6" y="2" width="12" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><circle cx="12" cy="6" r="1" fill="currentColor" /></>),
  priedai: sv(<><circle cx="12" cy="12" r="3" /><path d="M12 1v6M12 17v6M4.2 4.2l4.3 4.3M15.5 15.5l4.3 4.3M1 12h6M17 12h6" /></>),
  // ploksteles
  lp: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>),
  ep: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>),
  single: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></>),
  cd: sv(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="2.5" /><path d="M18.5 6 14.8 9.2" /></>),
  kasete: sv(<><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" /></>),
  // paslaugos
  pamokos: sv(<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>),
  irasymas: sv(<><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /></>),
  miksavimas: sv(<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" /></>),
  remontas: sv(<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>),
  'repeticiju-baze': sv(<><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></>),
  // rysiai
  'iesko-grupes-nario': sv(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>),
  'iesko-grupes': sv(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></>),
  bendraautoris: sv(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>),
  jamai: sv(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
}
const TYPE_ICON: Record<ListingType, ReactNode> = {
  ploksteles: SUBTYPE_ICON.lp, instrumentai: SUBTYPE_ICON.gitaros,
  paslaugos: SUBTYPE_ICON.pamokos, rysiai: SUBTYPE_ICON['iesko-grupes-nario'],
  kita: sv(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></>),
}

export function ListingCard({ listing }: { listing: Listing }) {
  const price = formatPrice(listing.price_cents, listing.price_unit, listing.is_free)
  const artist = listing.artist
  const cover = listing.photos?.[0] || artist?.cover_image_url || null
  const sub = subtypeLabel(listing.type, listing.subtype)
  const instr = labelFor(INSTRUMENTS, listing.instrument)
  const icon = (listing.subtype && SUBTYPE_ICON[listing.subtype]) || TYPE_ICON[listing.type]

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
        ) : (
          <span style={{ opacity: 0.45 }}>{icon}</span>
        )}
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

        {/* Atlikėjo chip (Įrašams su katalogo sąsaja) */}
        {artist && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {artist.cover_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxyImg(artist.cover_image_url, 48)} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
            )}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artist.name}</span>
          </span>
        )}

        {price && (
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent-green)' }}>{price}</span>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.join(' · ')}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>
            {listing.source_name ? `↗ ${listing.source_name}` : relativeTime(listing.created_at)}
          </span>
        </div>
      </div>

      <style jsx>{`
        .listing-card:hover { transform: translateY(-2px); border-color: var(--border-strong) !important; }
      `}</style>
    </Link>
  )
}
