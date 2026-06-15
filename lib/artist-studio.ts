// lib/artist-studio.ts
//
// Atlikėjo studijos (Music.lt for Artists) nuosavybės + prieigos helper'iai.
// Studija = savitarnos įrankiai atlikėjams valdyti profilį, fanus, žinutes.
//
// Nuosavybės modelis: artist_team (artist_id ↔ profile_id, role owner|manager).
// artist_members JAU užimta grupės sudėčiai — todėl team, ne members.
// Žr. 20260615b_atlikejo_studija.sql.

import { createAdminClient } from '@/lib/supabase'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveProfile } from '@/lib/profile-resolve'
import { createNotification } from '@/lib/notifications'

export type TeamArtist = {
  id: number
  slug: string
  name: string
  cover_image_url: string | null
  role: string
  status: string
}

/** Visi atlikėjai, kuriuos valdo šis profilis (aktyvūs team nariai). */
export async function getTeamArtists(profileId: string): Promise<TeamArtist[]> {
  if (!profileId) return []
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_team')
      .select('role, status, artists!inner(id, slug, name, cover_image_url)')
      .eq('profile_id', profileId)
      .eq('status', 'active')
    return (data || []).map((r: any) => ({
      id: r.artists.id,
      slug: r.artists.slug,
      name: r.artists.name,
      cover_image_url: r.artists.cover_image_url,
      role: r.role,
      status: r.status,
    }))
  } catch {
    return []
  }
}

/** Parenka aktyvų atlikėją iš ?a= param arba pirmą iš sąrašo. */
export function pickActiveArtist(artists: TeamArtist[], aParam?: string | string[]): TeamArtist | null {
  if (!artists.length) return null
  const raw = Array.isArray(aParam) ? aParam[0] : aParam
  const id = Number(raw)
  if (Number.isFinite(id)) {
    const found = artists.find((a) => a.id === id)
    if (found) return found
  }
  return artists[0]
}

/** Ar profilis turi prieigą prie konkretaus atlikėjo (owner/manager arba admin). */
export async function hasArtistAccess(profileId: string, artistId: number, role?: string | null): Promise<boolean> {
  if (!profileId || !Number.isFinite(artistId)) return false
  if (role === 'admin' || role === 'super_admin') return true
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('artist_team')
      .select('id')
      .eq('profile_id', profileId)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * API route guard. Grąžina { profile, ok } — ok=true jei prisijungęs ir
 * (turi prieigą prie artistId arba yra admin). Jei artistId nenurodytas,
 * tikrina tik prisijungimą.
 */
export async function requireStudioAccess(artistId?: number): Promise<{
  profile: any | null
  ok: boolean
  reason?: string
}> {
  const session = await getServerSession(authOptions)
  const profile = await resolveProfile(session)
  if (!profile?.id) return { profile: null, ok: false, reason: 'unauthenticated' }
  if (artistId == null) return { profile, ok: true }
  const ok = await hasArtistAccess(profile.id, artistId, profile.role)
  return { profile, ok, reason: ok ? undefined : 'forbidden' }
}

/**
 * Patvirtina claim'ą: sukuria artist_team owner eilutę, pažymi
 * artists.is_claimed=true, uždaro claim. Idempotentiška.
 */
export async function approveClaim(claimId: string, reviewerId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = createAdminClient()
    const { data: claim } = await sb
      .from('artist_claims')
      .select('id, artist_id, profile_id, status')
      .eq('id', claimId)
      .maybeSingle()
    if (!claim) return { ok: false, error: 'not_found' }

    await sb.from('artist_team').upsert(
      { artist_id: claim.artist_id, profile_id: claim.profile_id, role: 'owner', status: 'active' },
      { onConflict: 'artist_id,profile_id' }
    )
    await sb.from('artists').update({ is_claimed: true }).eq('id', claim.artist_id)
    await sb.from('artist_claims').update({
      status: 'approved',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    }).eq('id', claimId)

    // Pranešam vartotojui, kad patvirtinta (in-app + push). El. laiškas — F1.
    try {
      const { data: art } = await sb.from('artists').select('slug, name').eq('id', claim.artist_id).maybeSingle()
      await createNotification({
        user_id: claim.profile_id,
        type: 'system',
        entity_type: 'artist',
        entity_id: claim.artist_id,
        url: '/atlikejams/studija',
        title: `Sveikiname! Profilis „${art?.name || ''}" patvirtintas`,
        snippet: 'Dabar gali valdyti savo profilį, fanus ir žinutes savo studijoje.',
        data: { kind: 'claim_approved' },
      })
    } catch {}

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'error' }
  }
}

/** Atmeta claim'ą. */
export async function rejectClaim(claimId: string, reviewerId: string | null, note?: string): Promise<{ ok: boolean }> {
  try {
    const sb = createAdminClient()
    await sb.from('artist_claims').update({
      status: 'rejected',
      reviewed_by: reviewerId,
      review_note: note || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', claimId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
