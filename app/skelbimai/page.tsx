import type { Metadata } from 'next'
import Link from 'next/link'
import { ListingCard } from '@/components/skelbimai/ListingCard'
import {
  countsByType, listListings, listFeatured,
  LISTING_TYPES, LISTING_TYPE_ORDER,
} from '@/lib/skelbimai'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Skelbimai — muzikantų ryšiai, paslaugos, plokštelės, instrumentai | music.lt',
  description: 'Nemokama muzikos bendruomenės skelbimų lenta. Ieškok grupės nario, muzikos paslaugų, vinilų ir instrumentų — viskas vienoje vietoje.',
}

// Tipų ikonos (inline SVG — projektas neturi ikonų bibliotekos).
const ICON: Record<string, React.ReactNode> = {
  rysiai: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  paslaugos: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  ploksteles: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>,
  instrumentai: <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18 6.5 20.5a2.12 2.12 0 0 1-3-3L6 15" /><path d="m9 9 5 5L15 9 9 9z" /><path d="m22 2-9 9" /><path d="M9 9c-.5-1.5-2-2.5-3.5-2-1.5.5-2.5 2-2 3.5L4 12" /></svg>,
}

function hexA(hex: string, a: string) { return hex + a }

export default async function SkelbimaiHub() {
  const [counts, newest, featured] = await Promise.all([
    countsByType(),
    listListings({ limit: 12, sort: 'newest' }),
    listFeatured(4),
  ])

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 20px 80px' }}>

      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 'clamp(28px,5vw,42px)', fontWeight: 900, letterSpacing: '-0.025em', color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Skelbimai
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, maxWidth: 640, lineHeight: 1.5 }}>
          Nemokama muzikos bendruomenės lenta — ieškok grupės nario, muzikos paslaugų, vinilų ir instrumentų. Susitark tiesiogiai per žinutes.
        </p>

        {/* Paieška (plain GET form → /skelbimai/paieska) */}
        <form action="/skelbimai/paieska" style={{ display: 'flex', gap: 8, marginTop: 18, maxWidth: 560 }}>
          <input
            type="search" name="q" placeholder="Ieškok skelbimų…"
            style={{
              flex: 1, padding: '12px 16px', fontSize: 15, borderRadius: 10,
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '12px 20px', fontSize: 15, fontWeight: 700, borderRadius: 10,
            background: 'var(--accent-green)', color: '#04140a', border: 'none', cursor: 'pointer',
          }}>Ieškoti</button>
        </form>
      </div>

      {/* Kategorijų plytelės */}
      <div style={{
        display: 'grid', gap: 14, marginBottom: 36,
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      }}>
        {LISTING_TYPE_ORDER.map(t => {
          const meta = LISTING_TYPES[t]
          const n = counts[t] || 0
          const inner = (
            <div style={{
              position: 'relative', padding: '18px 18px 16px', borderRadius: 16, height: '100%',
              background: `linear-gradient(150deg, ${hexA(meta.accent, '1f')} 0%, var(--bg-elevated) 60%)`,
              border: `1px solid ${hexA(meta.accent, '33')}`,
              opacity: meta.live ? 1 : 0.62,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12, marginBottom: 12,
                background: `linear-gradient(135deg, ${meta.accent}, ${meta.accent}bb)`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 8px 22px ${hexA(meta.accent, '55')}`,
              }}>{ICON[t]}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{meta.label}</h2>
                {meta.live
                  ? <span style={{ fontSize: 12.5, fontWeight: 700, color: meta.accent }}>{n}</span>
                  : <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', border: '1px solid var(--border-default)', borderRadius: 999, padding: '1px 7px' }}>Greitai</span>}
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>{meta.desc}</p>
            </div>
          )
          return meta.live
            ? <Link key={t} href={`/skelbimai/${meta.slug}`} style={{ textDecoration: 'none' }}>{inner}</Link>
            : <div key={t} style={{ cursor: 'default' }}>{inner}</div>
        })}
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px' }}>
            Redakcijos pasirinkti
          </h2>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {featured.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      {/* Naujausi */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Naujausi skelbimai</h2>
          <Link href="/skelbimai/naujas" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-green)', textDecoration: 'none' }}>
            + Įdėti skelbimą
          </Link>
        </div>

        {newest.length === 0 ? (
          <div style={{
            padding: '48px 24px', textAlign: 'center', borderRadius: 16,
            border: '1px dashed var(--border-default)', color: 'var(--text-muted)',
          }}>
            <p style={{ margin: '0 0 14px', fontSize: 15 }}>Kol kas skelbimų nėra. Būk pirmas!</p>
            <Link href="/skelbimai/naujas" style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 10, fontWeight: 700,
              background: 'var(--accent-green)', color: '#04140a', textDecoration: 'none',
            }}>+ Įdėti skelbimą</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {newest.map(l => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>
    </div>
  )
}
