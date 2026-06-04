import type { Metadata } from 'next'
import Link from 'next/link'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import {
  countsByType, listListings,
  LISTING_TYPES, LISTING_TYPE_ORDER,
  type ListingType, type Listing,
} from '@/lib/skelbimai'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Skelbimai — įrašai, instrumentai, paslaugos, muzikantai | music.lt',
  description: 'Nemokama muzikos bendruomenės skelbimų lenta. Vinilai ir CD, instrumentai, muzikos paslaugos, grupių nariai ir muzikantai — viskas vienoje vietoje.',
}

// Tipų ikonos (inline SVG — projektas neturi ikonų bibliotekos).
const ICON: Record<ListingType, React.ReactNode> = {
  ploksteles: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>,
  instrumentai: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12" /></svg>,
  paslaugos: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  rysiai: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  kita: <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>,
}

function CategoryRow({ type, items }: { type: ListingType; items: Listing[] }) {
  const meta = LISTING_TYPES[type]
  return (
    <section style={{ marginBottom: 30 }}>
      {/* Antraštė */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: `${meta.accent}1f`, color: meta.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{ICON[type]}</span>
          <div style={{ minWidth: 0 }}>
            <h2 className="font-['Outfit',sans-serif]" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.15 }}>
              {meta.label}
              {meta.live && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', marginLeft: 8 }}>{items.length || ''}</span>}
            </h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.subtitle}</div>
          </div>
        </div>
        {meta.live && (
          <Link href={`/skelbimai/${meta.slug}`} className="font-['Outfit',sans-serif]" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-orange)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Visi →
          </Link>
        )}
      </div>

      {/* Eilutė */}
      {meta.live && items.length > 0 ? (
        <div className="sk-scroll" style={{ display: 'flex', gap: 12, paddingBottom: 4 }}>
          {items.map(l => (
            <div key={l.id} style={{ flex: '0 0 auto', width: 188 }}>
              <ListingCard listing={l} />
            </div>
          ))}
          <Link href={`/skelbimai/${meta.slug}`} style={{
            flex: '0 0 auto', width: 130, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14,
            border: '1px dashed var(--border-strong)', color: 'var(--accent-orange)',
            textDecoration: 'none', fontWeight: 700, fontSize: 13.5,
          }}>
            Visi →
          </Link>
        </div>
      ) : meta.live ? (
        // Live, bet tuščia
        <Link href={`/skelbimai/naujas?tipas=${meta.type}`} style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14,
          border: '1px dashed var(--border-default)', background: 'var(--bg-surface)',
          textDecoration: 'none',
        }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Kol kas tuščia — <span style={{ color: 'var(--accent-orange)', fontWeight: 700 }}>būk pirmas, įdėk skelbimą</span></span>
        </Link>
      ) : (
        // „Greitai" teaser
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14,
          border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: meta.accent, border: `1px solid ${meta.accent}55`, borderRadius: 999, padding: '3px 10px' }}>GREITAI</span>
          <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>{meta.desc}</span>
        </div>
      )}
    </section>
  )
}

export default async function SkelbimaiHub() {
  const [counts, paslaugos, rysiai] = await Promise.all([
    countsByType(),
    listListings({ type: 'paslaugos', limit: 10, sort: 'newest' }),
    listListings({ type: 'rysiai', limit: 10, sort: 'newest' }),
  ])
  const itemsByType: Record<ListingType, Listing[]> = {
    ploksteles: [], instrumentai: [], paslaugos, rysiai, kita: [],
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 80px' }}>

      {/* Hero — suderintas su svetainės stiliumi (h1 kaip /naujienos) */}
      <div style={{ marginBottom: 26 }}>
        <h1 className="text-3xl font-black text-[var(--text-primary)] sm:text-4xl">Skelbimai</h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 620, lineHeight: 1.5 }}>
          Nemokama muzikos bendruomenės lenta — įrašai, instrumentai, paslaugos ir muzikantai. Susitark tiesiogiai per žinutes.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <form action="/skelbimai/paieska" style={{ display: 'flex', gap: 8, flex: '1 1 340px', minWidth: 240 }}>
            <input
              type="search" name="q" placeholder="Ieškok skelbimų…"
              style={{
                flex: 1, padding: '11px 15px', fontSize: 15, borderRadius: 10,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button type="submit" style={btnOrange}>Ieškoti</button>
          </form>
          <Link href="/skelbimai/naujas" style={{ ...btnOrange, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            + Įdėti skelbimą
          </Link>
        </div>
      </div>

      {/* Kategorijų eilutės (homepage dvasia) */}
      {LISTING_TYPE_ORDER.map(t => (
        <CategoryRow key={t} type={t} items={itemsByType[t]} />
      ))}

      {/* Greitos nuorodos apačioje */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
        <Link href="/skelbimai/mano" style={{ color: 'var(--accent-link)', textDecoration: 'none' }}>Mano skelbimai</Link>
        <Link href="/skelbimai/issaugoti" style={{ color: 'var(--accent-link)', textDecoration: 'none' }}>Įsiminti</Link>
      </div>

      <style>{`
        .sk-scroll{ overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
        .sk-scroll::-webkit-scrollbar{ display:none; }
      `}</style>
    </div>
  )
}

const btnOrange: React.CSSProperties = {
  padding: '11px 18px', fontSize: 15, fontWeight: 700, borderRadius: 10,
  background: 'var(--accent-orange)', color: '#fff', border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap',
}
