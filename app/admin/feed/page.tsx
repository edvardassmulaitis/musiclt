// app/admin/feed/page.tsx
// Homepage reader feed valdymas — prisegti / paslėpti / pertvarkyti / pridėti laisvą įrašą.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import FeedAdminClient from './FeedAdminClient'

export const metadata: Metadata = { title: 'Feed — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AdminFeedPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['editor', 'admin', 'super_admin'].includes((session.user as any).role || '')) {
    redirect('/admin')
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          📲 Pagrindinis feed'as
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Tai, kas rodoma mobiliame „istorijų" sraute. 📌 prisek viršuje, 👁/🚫 paslėpk, ▲▼ pertvarkyk (→ „Išsaugoti tvarką"),
          arba pridėk laisvą įrašą (pvz. iš bendruomenės). Auto-įrašai (naujienos, topai, renginiai…) atsinaujina patys —
          override'ai išlieka pagal nuorodą.
        </p>
      </div>
      <FeedAdminClient />
    </div>
  )
}
