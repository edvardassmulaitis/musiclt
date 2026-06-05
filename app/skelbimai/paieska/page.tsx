import type { Metadata } from 'next'
import Link from 'next/link'
import { CategoryBrowser } from '@/components/skelbimai/CategoryBrowser'
import { listListings } from '@/lib/skelbimai'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams
  return { title: q ? `„${q}" — paieška skelbimuose | music.lt` : 'Paieška skelbimuose | music.lt' }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const initial = q.trim() ? await listListings({ q: q.trim(), sort: 'newest', limit: 60 }) : []

  return (
    <div className="page-shell">
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Paieška</span>
      </nav>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 18px' }}>
        {q ? <>Paieška: „{q}"</> : 'Paieška skelbimuose'}
      </h1>
      <CategoryBrowser type={null} initialListings={initial} initialQ={q} />
    </div>
  )
}
