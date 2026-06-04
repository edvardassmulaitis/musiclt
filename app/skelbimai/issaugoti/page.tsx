import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'
import { listSaved } from '@/lib/skelbimai'
import { ListingCard } from '@/components/skelbimai/ListingCard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Įsiminti skelbimai | music.lt', robots: { index: false } }

export default async function SavedPage() {
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) redirect('/auth/signin?callbackUrl=/skelbimai/issaugoti')

  const items = await listSaved(userId)

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px 80px' }}>
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Įsiminti</span>
      </nav>
      <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 20px' }}>Įsiminti skelbimai</h1>

      {items.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', borderRadius: 16, border: '1px dashed var(--border-default)', color: 'var(--text-muted)' }}>
          Dar nieko neįsiminei. Naršyk <Link href="/skelbimai" style={{ color: 'var(--accent-orange)' }}>skelbimus</Link> ir spausk ♥.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {items.map(l => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}
    </div>
  )
}
