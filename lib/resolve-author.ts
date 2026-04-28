// lib/resolve-author.ts
//
// Resolves the current authenticated viewer to a profile UUID for use as a
// `author_id` / `user_id` foreign key. NextAuth sets `session.user.id` to
// the profile UUID at signIn (lib/auth.ts), but in practice we hit two
// edge cases that a plain `session.user.id` lookup misses:
//
//   1. JWT staleness: a profile was wiped by a migration (task #2, #143)
//      after the user signed in, leaving a JWT that points to a
//      non-existent UUID. FK insert fails with "comments_author_id_fkey".
//   2. Email-based legacy lookup: some surfaces previously did email
//      roundtrip; if a stale JWT lacks an id but has email, we still want
//      to find the right profile.
//
// Strategy:
//   1. Try the JWT id verbatim — fast path; usually works.
//   2. Fall back to email lookup.
//   3. If still not found AND we have email + name, RECREATE the profile
//      using the JWT id (mirrors lib/auth.ts signIn callback). This makes
//      authoring resilient to schema-wipe migrations.

import type { Session } from 'next-auth'
import type { createAdminClient } from './supabase'

export type Sb = ReturnType<typeof createAdminClient>

/** Returns the profile UUID for the viewer, creating the row if it has been
 *  wiped by a migration. Returns null only if the session itself is missing. */
export async function resolveAuthorId(
  sb: Sb,
  session: Session | null,
): Promise<string | null> {
  if (!session?.user) return null
  const { id, email, name, image } = session.user as {
    id?: string; email?: string | null; name?: string | null; image?: string | null
  }

  // 1. Try JWT id directly.
  if (id) {
    const { data } = await sb.from('profiles').select('id').eq('id', id).maybeSingle()
    if (data?.id) return data.id
  }

  // 2. Fall back to email lookup.
  if (email) {
    const { data } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
    if (data?.id) return data.id
  }

  // 3. Recreate profile if we have enough info (email is the unique key).
  // This handles the JWT-points-to-wiped-profile case: the user is
  // legitimately signed in, the migration nuked their row, we re-establish
  // it with the JWT's id so future writes succeed.
  if (email) {
    const insertRow: any = {
      email,
      full_name: name || null,
      avatar_url: image || null,
      role: 'user',
      provider: 'recreated',
    }
    // Use the JWT id when present so the FK in `likes` / `comments` etc.
    // matches what session.user.id will keep returning until the user
    // signs out and back in.
    if (id) insertRow.id = id
    const { data, error } = await sb
      .from('profiles')
      .insert(insertRow)
      .select('id')
      .single()
    if (!error && data?.id) {
      console.log(`[resolveAuthorId] recreated profile for ${email} → ${data.id}`)
      return data.id
    }
    // Insert failed — most likely id collision. Final attempt: lookup by email
    // (someone else might have raced an insert).
    const { data: again } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
    if (again?.id) return again.id
  }

  return null
}
