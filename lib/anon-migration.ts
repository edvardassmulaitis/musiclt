// lib/anon-migration.ts
//
// Migrate anonymous (cookie-identified) contributions into a freshly signed-in
// user's profile. Called from next-auth's signIn callback, but also exported
// as a standalone function for any future manual "reconcile" endpoint.
//
// Design notes:
//  - Idempotent: safe to re-run. Rows already owned by the profile are
//    detected up-front and skipped (likes UNIQUE (entity_type, entity_id, user_username)
//    saugiklis užtikrina kad nedubliuosis).
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

/** Migrate anon_artist_likes from likes table (source='anon') to the given profile_id
 *  by updating user_id and source. Skips artists the profile has already liked.
 *  Returns the number of rows updated. */
async function migrateArtistLikes(
  sb: ReturnType<typeof createAdminClient>,
  anonId: string,
  profileId: string,
  userUsername: string,
): Promise<number> {
  try {
    // Find all anon likes for this anon_id (anonymous user, not ghost)
    const { data: anonRows } = await sb
      .from('likes')
      .select('id, entity_id')
      .eq('source', 'anon')
      .eq('anon_id', anonId)
      .eq('entity_type', 'artist')
    const likeIds = (anonRows || []).map((r: any) => r.id)
    const artistIds = (anonRows || []).map((r: any) => r.entity_id)
    if (artistIds.length === 0) return 0

    // Skip artists the profile has already liked while signed in.
    const { data: existing } = await sb
      .from('likes')
      .select('entity_id')
      .eq('user_id', profileId)
      .eq('entity_type', 'artist')
      .eq('source', 'auth')
      .in('entity_id', artistIds)
    const already = new Set((existing || []).map((r: any) => r.entity_id))

    const toUpdate = artistIds.filter((aid: number) => !already.has(aid))
    const toUpdateIds = likeIds.filter((_: any, i: number) => !already.has(artistIds[i]))

    if (toUpdateIds.length > 0) {
      // Update anon rows to be owned by the new user
      const { error } = await sb
        .from('likes')
        .update({ user_id: profileId, user_username: userUsername, source: 'auth', anon_id: null })
        .in('id', toUpdateIds)
      if (error) {
        console.error('[anon-migration] likes update failed:', error.message)
        return 0
      }
    }

    return toUpdateIds.length
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
  userUsername: string,
): Promise<{ artistLikes: number }> {
  const sb = createAdminClient()
  const artistLikes = await migrateArtistLikes(sb, anonId, profileId, userUsername)
  return { artistLikes }
}
