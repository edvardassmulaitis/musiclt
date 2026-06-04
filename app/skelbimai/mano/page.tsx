import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'
import { listMine } from '@/lib/skelbimai'
import { MyListings } from '@/components/skelbimai/MyListings'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Mano skelbimai | music.lt', robots: { index: false } }

export default async function MyListingsPage() {
  const session = await getServerSession(authOptions)
  const sb = createAdminClient()
  const userId = await resolveAuthorId(sb, session)
  if (!userId) redirect('/auth/signin?callbackUrl=/skelbimai/mano')

  const items = await listMine(userId)

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px 80px' }}>
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Mano skelbimai</span>
      </nav>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'clamp(22px,4vw,30px)', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>Mano skelbimai</h1>
        <Link href="/skelbimai/naujas" style={{ padding: '9px 16px', fontSize: 14, fontWeight: 700, borderRadius: 9, background: 'var(--accent-orange)', color: '#fff', textDecoration: 'none' }}>+ Įdėti skelbimą</Link>
      </div>
      <MyListings initial={items} />
    </div>
  )
}
