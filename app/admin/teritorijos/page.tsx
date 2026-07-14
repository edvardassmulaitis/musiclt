// app/admin/teritorijos/page.tsx
// Admin: muzikos pasaulio žemėlapis (Gilyn v3) — pasauliai → teritorijos → atlikėjai.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import TeritorijosClient from './TeritorijosClient'

export const metadata: Metadata = { title: 'Muzikos žemėlapis — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function TeritorijosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) redirect('/')
  return <TeritorijosClient />
}
