// lib/profile-resolve.ts
//
// Robust profile lookup'as JWT session'ui. Po DB wipe'ų ar OAuth re-link'ų
// session.user.id gali turėti seną UUID, kuris neegzistuoja DB. Tokiu atveju
// nuvykstam į email fallback ir, jei reikia, sukuriam profilį iš naujo.
//
// SAUGUMAS po 2026-05-02 incident'o:
//   - Email lookup'as CASE-INSENSITIVE (ilike) — anksčiau eq() trūko match'o
//     kai OAuth provider grąžindavo mixed-case email'ą, o profile saugomas
//     lowercase'inta forma. Tai vesdavo prie nereikalingo INSERT'o ir
//     duplicate profilių.
//   - INSERT pakeistas į UPSERT su ON CONFLICT email (per UNIQUE INDEX
//     LOWER(email)) — net jei race'as įvyks, duplicate'o nebus.
//   - JOKIO role override'inimo — net naujam profile'ui leidžiam DB
//     default'ą (kuris yra 'user'), o admin role tvarkoma signIn callback'e
//     per admin_whitelist.

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

export async function resolveProfile(session: Session | null): Promise<ResolvedProfile | null> {
  if (!session?.user) return null
  const sb = createAdminClient()
  const sessionId = session.user.id as string | undefined
  const sessionEmail = session.user.email as string | undefined
  const normEmail = sessionEmail?.trim().toLowerCase()

  // 1. Try by ID (the common case — JWT id mato esamą profilį)
  if (sessionId) {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle()
    if (data) return data as ResolvedProfile
  }

  // 2. Fallback by email — CASE-INSENSITIVE. ilike(email, exact_match) leidžia
  //    rasti "Foo@Bar.com" kai DB turi "foo@bar.com". Naudojam .limit(1).
  if (normEmail) {
    const { data } = await sb
      .from('profiles')
      .select('*')
      .ilike('email', normEmail)        // case-insensitive exact match
      .limit(1)
      .maybeSingle()
    if (data) return data as ResolvedProfile
  }

  // 3. Create — ON CONFLICT (LOWER(email)) DO NOTHING ekvivalentas. Jei
  //    duplikatas race'iškai įsiterpė, surandam jau egzistuojantį per
  //    refetch'ą (ne sukuriam antro). Per UNIQUE INDEX migration'oje tai
  //    user-DB enforce'ina; čia tik handlinam normaliai.
  if (normEmail) {
    const { data: inserted, error } = await sb
      .from('profiles')
      .insert({
        email: normEmail,
        full_name: session.user.name || null,
        avatar_url: session.user.image || null,
        // role: NESET'INAM — DB defaultas ('user') taikomas; admin role
        // tvarkoma per signIn whitelist mechanizmą.
      })
      .select('*')
      .single()

    if (!error && inserted) return inserted as ResolvedProfile

    // INSERT galėjo failint dėl unique conflict'o (race) — refetch'inam.
    if (error) {
      console.warn('[profile-resolve] insert failed, refetch by email:', error.message)
      const { data: refetched } = await sb
        .from('profiles')
        .select('*')
        .ilike('email', normEmail)
        .limit(1)
        .maybeSingle()
      if (refetched) return refetched as ResolvedProfile
    }
  }

  return null
}
