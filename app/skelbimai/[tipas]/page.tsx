import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CategoryBrowser } from '@/components/skelbimai/CategoryBrowser'
import { typeFromSlug, listListings, LISTING_TYPES } from '@/lib/skelbimai'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ tipas: string }> }): Promise<Metadata> {
  const { tipas } = await params
  const type = typeFromSlug(tipas)
  if (!type) return { title: 'Skelbimai — music.lt' }
  const m = LISTING_TYPES[type]
  return { title: `${m.seoTitle} | music.lt`, description: m.desc }
}

export default async function CategoryPage({ params }: { params: Promise<{ tipas: string }> }) {
  const { tipas } = await params
  const type = typeFromSlug(tipas)
  if (!type) notFound()

  const meta = LISTING_TYPES[type]

  // Tuščių/neaktyvių kategorijų nerodom kaip sąrašo — „greitai" būsena.
  if (!meta.live) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 12px' }}>{meta.h1}</h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
          Ši kategorija ruošiama — netrukus galėsi {type === 'ploksteles' ? 'parduoti ir pirkti vinilus tiesiai iš music.lt katalogo' : 'parduoti ir pirkti instrumentus bei garso techniką'}.
        </p>
        <Link href="/skelbimai" style={{ color: 'var(--accent-orange)', fontWeight: 700, textDecoration: 'none' }}>← Atgal į skelbimus</Link>
      </div>
    )
  }

  const initial = await listListings({ type, sort: 'newest', limit: 60 })

  return (
    <div className="page-shell">
      <nav style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
      </nav>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,34px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 6px' }}>{meta.h1}</h1>
          <p style={{ fontSize: 14.5, color: 'var(--text-secondary)', margin: 0, maxWidth: 560 }}>{meta.desc}</p>
        </div>
        <Link href={`/skelbimai/naujas?tipas=${meta.type}`} style={{
          padding: '10px 18px', fontSize: 14, fontWeight: 700, borderRadius: 10, whiteSpace: 'nowrap',
          background: 'var(--accent-orange)', color: '#fff', textDecoration: 'none',
        }}>+ Įdėti skelbimą</Link>
      </div>

      <CategoryBrowser type={type} initialListings={initial} />
    </div>
  )
}
