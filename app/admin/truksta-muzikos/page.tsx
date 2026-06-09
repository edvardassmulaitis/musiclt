// app/admin/truksta-muzikos/page.tsx
// Admin: vieninga trūkstamos muzikos eilė (visi šaltiniai → music_requests).

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import TrukstaMuzikosClient from './TrukstaMuzikosClient'

export const metadata: Metadata = { title: 'Trūkstama muzika — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function TrukstaMuzikosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) redirect('/')
  return <TrukstaMuzikosClient />
}
