// app/admin/irasai/page.tsx
// Admin: narių įrašų tipų tvarkymas (homepage Bendruomenės juosta) + topų normalizavimas.

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import IrasaiAdminClient from './IrasaiAdminClient'

export const metadata: Metadata = { title: 'Narių įrašai — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function IrasaiAdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) redirect('/')
  return <IrasaiAdminClient />
}
