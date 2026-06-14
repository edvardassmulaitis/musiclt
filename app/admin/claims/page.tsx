// app/admin/claims/page.tsx — atlikėjų „Tai mano profilis" verifikacijos eilė.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import ClaimsClient, { type ClaimRow } from './ClaimsClient'

export const metadata = { title: 'Atlikėjų claim\'ai — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AdminClaimsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) redirect('/')

  const sb = createAdminClient()
  const { data } = await sb
    .from('artist_claims')
    .select('id, method, proof_url, message, status, created_at, artists!inner(id, slug, name, cover_image_url, is_claimed), profiles!artist_claims_profile_id_fkey(id, email, full_name, username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  const claims: ClaimRow[] = (data || []).map((c: any) => ({
    id: c.id, method: c.method, proof_url: c.proof_url, message: c.message, created_at: c.created_at,
    artist: { id: c.artists.id, slug: c.artists.slug, name: c.artists.name, cover_image_url: c.artists.cover_image_url, is_claimed: c.artists.is_claimed },
    user: { email: c.profiles?.email || null, full_name: c.profiles?.full_name || null, username: c.profiles?.username || null },
  }))

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
      <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
        🎫 Atlikėjų prašymai
      </h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        „Tai mano profilis" prašymai. Patvirtinus — vartotojas gauna atlikėjo studiją (/studija).
        Patikrink proof nuorodą (ar oficialus soc. tinklas atitinka atlikėją).
      </p>
      <div className="mt-5"><ClaimsClient initial={claims} /></div>
    </div>
  )
}
