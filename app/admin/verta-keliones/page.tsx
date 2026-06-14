// app/admin/verta-keliones/page.tsx
// Admin valdymas „Verta kelionės" (/verta-keliones).
// Kandidatai (AI scout) → approve · Koncertai (CRUD) · Kryptys (CRUD).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import VKAdminClient from './VKAdminClient'

export const metadata: Metadata = { title: 'Verta kelionės — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AdminVertaKelionesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes((session.user as any).role || '')) {
    redirect('/admin')
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
        <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
          ✈️ Verta kelionės
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Valdyk, kas rodoma <Link href="/verta-keliones" className="text-[var(--accent-link)]">/verta-keliones</Link>.
          {' '}<b>Scout</b> surenka 2026 turus iš Wikipedia → <b>Kandidatai</b> patvirtinimui · <b>Koncertai</b> = publikuoti · <b>Kryptys</b> = pasiekiami miestai.
        </p>
      </div>
      <VKAdminClient />
    </div>
  )
}
