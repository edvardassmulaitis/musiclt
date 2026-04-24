// lib/anon-migration.ts
//
// Migrate anonymous (cookie-identified) contributions into a freshly signed-in
// user's profile. Called from next-auth's signIn callback, but also exported
// as a standalone function for any future manual "reconcile" endpoint.
//
// Design notes:
//  - Idempotent: safe to re-run. Rows already in the registered table are
//    detected up-front and skipped (we don't rely on a UNIQUE constraint
//    necessarily being present, though one exists for artist_likes).
//  - Per-table branches return the count migrated so signIn can log a summary.
//  - We DON'T clear the anon cookie after migration — the anon_id stays so we
//    can still correlate past anon activity with this device for analytics,
//    and so future anon-only actions (e.g. user signing out) continue under
//    the same ml_anon_id.
//  - Adding a new anonymous table later: add a branch function below and call
//    it from migrateAnonToProfile.

import { cookies } from 'next/headers'
import { createAdminClient } from './supabase'

const ANON_COOKIE = 'ml_anon_id'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read ml_anon_id cookie from the current request, returning null if missing
 *  or malformed. Safe to call from any server context with access to cookies. */
export async function readAnonIdFromCookie(): Promise<string | null> {
  try {
    const store = await cookies()
    const v = store.get(ANON_COOKIE)?.value
    return v && UUID_RE.test(v) ? v : null
  } catch {
    return null
  }
}

/** Move anon_artist_likes rows (for a given anon_id) into artist_likes under
 *  the given profile_id. Skips artists the profile has already liked. Returns
 *  the number of new rows inserted. */
async function migrateArtistLikes(
  sb: ReturnType<typeof createAdminClient>,
  anonId: string,
  profileId: string,
): Promise<number> {
  try {
    const { data: anonRows } = await sb
      .from('anon_artist_likes')
      .select('artist_id')
      .eq('anon_id', anonId)
    const artistIds = Array.from(new Set(
      (anonRows || []).map((r: any) => r.artist_id).filter((n: any) => typeof n === 'number'),
    )) as number[]
    if (artistIds.length === 0) return 0

    // Skip artists the profile has already liked while signed in.
    const { data: existing } = await sb
      .from('artist_likes')
      .select('artist_id')
      .eq('user_id', profileId)
      .in('artist_id', artistIds)
    const already = new Set((existing || []).map((r: any) => r.artist_id))

    const toInsert = artistIds
      .filter(aid => !already.has(aid))
      .map(aid => ({ artist_id: aid, user_id: profileId }))

    if (toInsert.length > 0) {
      const { error } = await sb.from('artist_likes').insert(toInsert)
      if (error) {
        console.error('[anon-migration] artist_likes insert failed:', error.message)
        return 0
      }
    }

    // Remove anon rows for the artists we considered — both inserted and
    // already-present. Keeps the anon table tidy and prevents re-migration.
    await sb
      .from('anon_artist_likes')
      .delete()
      .eq('anon_id', anonId)
      .in('artist_id', artistIds)

    return toInsert.length
  } catch (e: any) {
    console.error('[anon-migration] artist_likes unexpected error:', e?.message || e)
    return 0
  }
}

/** Entry point — migrate every anon-keyed signal for this device into the
 *  given profile. Extend this function with more branches as new anonymous
 *  tables appear (comments, follows, event RSVPs, etc). */
export async function migrateAnonToProfile(
  anonId: string,
  profileId: string,
): Promise<{ artistLikes: number }> {
  const sb = createAdminClient()
  const artistLikes = await migrateArtistLikes(sb, anonId, profileId)
  return { artistLikes }
}
