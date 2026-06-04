import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveViewerId } from '@/lib/chat'
import { NewListingForm } from '@/components/skelbimai/NewListingForm'
import { typeFromSlug, type ListingType } from '@/lib/skelbimai'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Įdėti skelbimą | music.lt',
  robots: { index: false },
}

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ tipas?: string }> }) {
  const session = await getServerSession(authOptions)
  const userId = await resolveViewerId(session)
  if (!userId) redirect('/auth/signin?callbackUrl=/skelbimai/naujas')

  const { tipas } = await searchParams
  const t = tipas ? typeFromSlug(tipas) : null
  const initialType: ListingType | undefined = t === 'rysiai' || t === 'paslaugos' ? t : undefined

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 80px' }}>
      <nav style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
        <Link href="/skelbimai" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Skelbimai</Link>
        <span style={{ margin: '0 6px' }}>/</span>
        <span style={{ color: 'var(--text-secondary)' }}>Įdėti skelbimą</span>
      </nav>
      <h1 style={{ fontSize: 'clamp(24px,4vw,32px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 20px' }}>Įdėti skelbimą</h1>
      <NewListingForm initialType={initialType} />
    </div>
  )
}
