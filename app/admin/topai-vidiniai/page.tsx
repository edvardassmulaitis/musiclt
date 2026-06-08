// app/admin/topai-vidiniai/page.tsx
// Admin: vidinių narių topų susiejimo + patvirtinimo eilė.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import TopaiVidiniaiClient from './TopaiVidiniaiClient'

export const metadata: Metadata = { title: 'Vidiniai topai — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function TopaiVidiniaiPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) redirect('/')
  return <TopaiVidiniaiClient />
}
