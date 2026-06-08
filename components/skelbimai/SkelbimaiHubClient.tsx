'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HomeListModal } from '@/components/HomeListModal'
import Scroller from '@/components/ui/Scroller'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import { CategoryBrowser } from '@/components/skelbimai/CategoryBrowser'
import {
  LISTING_TYPES, LISTING_TYPE_ORDER,
  type ListingType, type Listing,
} from '@/lib/skelbimai'

/* Skelbimų hub — homepage dvasia: horizontalios eilės (hp-scroll), visada
 * matomas „expand" mygtukas (StickyMoreButton) atveria explore modalą
 * (HomeListModal) su gyvai filtruojančiu CategoryBrowser. */

const TYPE_ICON: Record<ListingType, React.ReactNode> = {
  ploksteles: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>,
  instrumentai: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12" /></svg>,
  paslaugos: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  rysiai: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  kita: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>,
}

export function SkelbimaiHubClient({ itemsByType }: { itemsByType: Record<ListingType, Listing[]> }) {
  const [modal, setModal] = useState<ListingType | 'all' | null>(null)
  const [q, setQ] = useState('')

  const openAll = () => setModal('all')
  const modalMeta = modal && modal !== 'all' ? LISTING_TYPES[modal] : null

  return (
    <div className="page-shell">
      {/* Hero */}
      <div style={{ marginBottom: 26 }}>
        <h1 className="font-['Outfit',sans-serif] text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)] sm:text-4xl">Skelbimai</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 620, lineHeight: 1.5 }}>
          Nemokama muzikos bendruomenės lenta — įrašai, instrumentai, paslaugos ir muzikantai. Susitark tiesiogiai per žinutes.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={e => { e.preventDefault(); openAll() }} style={{ display: 'flex', gap: 8, flex: '1 1 340px', minWidth: 240 }}>
            <input
              type="search" value={q} onChange={e => setQ(e.target.value)} onFocus={openAll} placeholder="Ieškok skelbimų…"
              style={{
                flex: 1, padding: '11px 15px', fontSize: 15, borderRadius: 10,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button type="submit" style={btnOrange}>Ieškoti</button>
          </form>
          <Link href="/skelbimai/naujas" style={{ ...btnBlue, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            + Įdėti skelbimą
          </Link>
        </div>
      </div>

      {/* Kategorijų eilės */}
      {LISTING_TYPE_ORDER.map(t => {
        const meta = LISTING_TYPES[t]
        const items = itemsByType[t] || []
        return (
          <section key={t} style={{ marginBottom: 30 }}>
            {/* Antraštė (SectionHead stilius) */}
            <div className="mb-3 flex items-center justify-between gap-3">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `${meta.accent}1f`, color: meta.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{TYPE_ICON[t]}</span>
                <div style={{ minWidth: 0 }}>
                  <h2 className="m-0 font-['Outfit',sans-serif] text-[17px] font-extrabold tracking-[-0.01em] text-[var(--text-primary)] sm:text-[18px]">{meta.label}</h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.subtitle}</div>
                </div>
              </div>
              <button onClick={() => setModal(t)} className="font-['Outfit',sans-serif] text-[11.5px] font-bold text-[var(--accent-orange)] no-underline transition-opacity hover:opacity-70" style={{ background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Visi →
              </button>
            </div>

            {/* Eilė + sticky expand */}
            {items.length > 0 ? (
              <Scroller className="min-w-0" gap={12} ariaLabel={meta.label}>
                  {items.map(l => (
                    <div key={l.id} style={{ flex: '0 0 auto', width: 240 }}>
                      <ListingCard listing={l} />
                    </div>
                  ))}
              </Scroller>
            ) : (
              <Link href={`/skelbimai/naujas?tipas=${meta.type}`} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '15px 18px', borderRadius: 12,
                border: '1px dashed var(--border-default)', background: 'var(--bg-surface)', textDecoration: 'none',
              }}>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Kol kas tuščia — <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>būk pirmas, įdėk skelbimą</span></span>
              </Link>
            )}
          </section>
        )
      })}

      {/* Greitos nuorodos */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
        <Link href="/skelbimai/mano" style={{ color: 'var(--accent-link)', textDecoration: 'none' }}>Mano skelbimai</Link>
        <Link href="/skelbimai/issaugoti" style={{ color: 'var(--accent-link)', textDecoration: 'none' }}>Įsiminti</Link>
      </div>

      {/* Explore modalas */}
      <HomeListModal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === 'all' ? 'Visi skelbimai' : modalMeta?.h1 || 'Skelbimai'}
        subtitle={modal === 'all' ? 'Ieškok per visas kategorijas' : modalMeta?.subtitle}
      >
        {modal !== null && (
          <CategoryBrowser
            type={modal === 'all' ? null : modal}
            initialListings={modal === 'all' ? [] : (itemsByType[modal] || [])}
            initialQ={modal === 'all' ? q : ''}
          />
        )}
      </HomeListModal>

      <style>{`
        .sk-scroll{ overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .sk-scroll::-webkit-scrollbar{ display:none; }
      `}</style>
    </div>
  )
}

const btnOrange: React.CSSProperties = {
  padding: '11px 18px', fontSize: 15, fontWeight: 700, borderRadius: 10,
  background: 'var(--accent-orange)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}
const btnBlue: React.CSSProperties = {
  padding: '11px 18px', fontSize: 15, fontWeight: 700, borderRadius: 10,
  background: 'var(--accent-blue)', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
}
