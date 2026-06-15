// app/admin/claims/page.tsx — atlikėjų prieigos valdymas:
//   1) laukiantys „Tai mano profilis" claim'ai (patvirtinti / atmesti)
//   2) aktyvių komandų sąrašas (narys, rolė, paskutinis prisijungimas, panaikinti)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import ClaimsClient, { type ClaimRow } from './ClaimsClient'
import TeamsClient, { type TeamRow } from './TeamsClient'

export const metadata = { title: 'Atlikėjų prieiga — admin | music.lt' }
export const dynamic = 'force-dynamic'

export default async function AdminClaimsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user || !['admin', 'super_admin'].includes(session.user.role || '')) redirect('/')

  const sb = createAdminClient()
  const [claimsRes, teamsRes] = await Promise.all([
    sb.from('artist_claims')
      .select('id, method, proof_url, message, status, created_at, artists!inner(id, slug, name, cover_image_url, is_claimed), profiles!artist_claims_profile_id_fkey(id, email, full_name, username)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    sb.from('artist_team')
      .select('id, role, status, created_at, artists!inner(id, slug, name, cover_image_url), profiles!artist_team_profile_id_fkey(id, email, full_name, username, last_seen_at)')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(300),
  ])

  const claims: ClaimRow[] = (claimsRes.data || []).map((c: any) => ({
    id: c.id, method: c.method, proof_url: c.proof_url, message: c.message, created_at: c.created_at,
    artist: { id: c.artists.id, slug: c.artists.slug, name: c.artists.name, cover_image_url: c.artists.cover_image_url, is_claimed: c.artists.is_claimed },
    user: { email: c.profiles?.email || null, full_name: c.profiles?.full_name || null, username: c.profiles?.username || null },
  }))

  const teams: TeamRow[] = (teamsRes.data || []).map((t: any) => ({
    id: t.id, role: t.role, created_at: t.created_at,
    artist: { id: t.artists.id, slug: t.artists.slug, name: t.artists.name, cover_image_url: t.artists.cover_image_url },
    user: { email: t.profiles?.email || null, full_name: t.profiles?.full_name || null, username: t.profiles?.username || null, last_seen_at: t.profiles?.last_seen_at || null },
  }))

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/admin" className="text-sm text-[var(--accent-link)]">← Admin</Link>
      <h1 className="mt-2 font-['Outfit',sans-serif] text-2xl font-extrabold text-[var(--text-primary)] sm:text-3xl">
        🎫 Atlikėjų prieiga
      </h1>

      <h2 className="mt-6 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">
        Laukiantys prašymai {claims.length > 0 && <span className="text-[var(--accent-orange)]">({claims.length})</span>}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Patikrink proof nuorodą (ar oficialus soc. tinklas atitinka atlikėją). Patvirtinus — vartotojas gauna studiją ir pranešimą.
      </p>
      <div className="mt-3"><ClaimsClient initial={claims} /></div>

      <h2 className="mt-9 font-['Outfit',sans-serif] text-lg font-bold text-[var(--text-primary)]">
        Aktyvios komandos {teams.length > 0 && <span className="text-[var(--text-muted)]">({teams.length})</span>}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Kas valdo kurį atlikėją, rolė ir paskutinis prisijungimas. Gali panaikinti prieigą.
      </p>
      <div className="mt-3"><TeamsClient initial={teams} /></div>
    </div>
  )
}
