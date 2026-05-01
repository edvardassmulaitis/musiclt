// lib/profile-resolve.ts
//
// Robust profile lookup'as JWT session'ui. Po DB wipe'ų ar OAuth re-link'ų
// session.user.id gali turėti seną UUID, kuris neegzistuoja DB. Tokiu atveju
// nuvykstam į email fallback ir, jei reikia, sukuriam profilį iš naujo.
//
// Kviečiama kiekviename API endpoint'e, kuriam reikia "tikras" profilis su
// UUID. Užtikrina, kad ir mūsų UPDATE'ai ir blog INSERT'ai naudoja
// EGZISTUOJANTĮ profile.id.

import type { Session } from 'next-auth'
import { createAdminClient } from '@/lib/supabase'

export type ResolvedProfile = {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  avatar_url: string | null
  role: string | null
  [k: string]: any
}

/**
 * Suranda arba sukuria profilį pagal session'ą. Trys etapai:
 *   1. SELECT pagal session.user.id (greičiausias atvejis — viskas OK)
 *   2. SELECT pagal session.user.email (po wipe'ų ID drift'as — gauname tikrąjį ID)
 *   3. INSERT — sukuriam naują profilį (legitimate atvejis: legacy session
 *      po pilno DB wipe'o, OAuth užtikrina email uniqueness)
 *
 * Grąžina null TIK jei session neturi nei id, nei email — t.y. nelegit
 * session, kažkas labai negerai.
 */
export async function resolveProfile(session: Session | null): Promise<ResolvedProfile | null> {
  if (!session?.user) return null
  const sb = createAdminClient()
  const sessionId = session.user.id as string | undefined
  const sessionEmail = session.user.email as string | undefined

  // 1. Try by ID (the common case)
  if (sessionId) {
    const { data } = await sb.from('profiles').select('*').eq('id', sessionId).maybeSingle()
    if (data) return data as ResolvedProfile
  }

  // 2. Fallback by email (post-wipe ID drift)
  if (sessionEmail) {
    const { data } = await sb.from('profiles').select('*').eq('email', sessionEmail).maybeSingle()
    if (data) return data as ResolvedProfile
  }

  // 3. Create — only if we have an email to anchor on
  if (sessionEmail) {
    const { data, error } = await sb
      .from('profiles')
      .insert({
        email: sessionEmail,
        full_name: session.user.name || null,
        avatar_url: session.user.image || null,
        role: 'user',
      })
      .select('*')
      .single()
    if (error) {
      console.error('[profile-resolve] insert failed:', error.message)
      return null
    }
    return data as ResolvedProfile
  }

  return null
}
