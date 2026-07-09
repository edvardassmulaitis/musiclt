// app/admin/matyti-gyvai/page.tsx
//
// Admin eilė narių „Matyti gyvai" draft'ams. Narys pasiūlo atlikėją (ir/ar
// renginį), kurio dar nėra DB → čia adminas pririša prie esamo / sukuria naują /
// palieka tekstu, ir patvirtina arba atmeta.

import type { Metadata } from 'next'
import Link from 'next/link'
import { listPendingSeenLive } from '@/lib/seen-live'
import SeenLiveReview from './SeenLiveReview'

export const metadata: Metadata = { title: 'Matyti gyvai — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AdminSeenLivePage() {
  let items: Awaited<ReturnType<typeof listPendingSeenLive>> = []
  try { items = await listPendingSeenLive(100) } catch { items = [] }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          🎤 Matyti gyvai
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Narių pasiūlyti atlikėjai / renginiai (kurių dar nėra DB). Pririšk prie esamo,
          sukurk naują arba palik tekstu — ir patvirtink. Patvirtinti įrašai atsiranda nario profilyje.
        </p>
      </div>

      <SeenLiveReview initial={items} />
    </div>
  )
}
