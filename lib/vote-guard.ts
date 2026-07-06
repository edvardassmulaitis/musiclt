// ─────────────────────────────────────────────────────────────────────────
// Balsavimo anti-cheat: įrenginio (fingerprint) ir IP paskyrų limitai.
//
// Sustabdo multi-account farmingą: vienas įrenginys / IP negali balsuoti per
// begalinį skaičių paskyrų tam pačiam scope'ui (savaitė / įvykis / nominacija).
// Derinama su: distinct-user reitingu, rate-limit, Turnstile, IP dedup.
// ─────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'

// Kiek SKIRTINGŲ paskyrų leidžiama iš vieno įrenginio/IP tam pačiam scope'ui.
// (Namų ūkis gali turėti kelis žmones — todėl ne 1.)
const MAX_ACCOUNTS_PER_DEVICE = 3
const MAX_ACCOUNTS_PER_IP = 4

export type VoteGuardResult = { allowed: boolean; reason?: 'device' | 'ip' }

/**
 * Registruoto balso patikra: ar (userId) gali balsuoti iš šio fingerprint/IP,
 * neviršijant paskyrų-per-įrenginį / paskyrų-per-IP limito duotam scope'ui.
 * Anon balsams grąžina allowed (jiems taikomas IP/fingerprint dedup atskirai).
 */
export async function deviceVoteGuard(opts: {
  table: 'top_votes' | 'voting_votes' | 'daily_song_votes'
  scopeColumn: string
  scopeValue: number | string
  userId: string | null
  fingerprint: string | null
  ip: string
}): Promise<VoteGuardResult> {
  const { table, scopeColumn, scopeValue, userId, fingerprint, ip } = opts
  if (!userId) return { allowed: true }
  const sb = createAdminClient()

  if (fingerprint && fingerprint.length >= 8) {
    const { data } = await sb.from(table).select('user_id')
      .eq(scopeColumn, scopeValue).eq('voter_fingerprint', fingerprint).not('user_id', 'is', null)
    const accounts = new Set((data || []).map((r: any) => String(r.user_id)))
    if (!accounts.has(String(userId)) && accounts.size >= MAX_ACCOUNTS_PER_DEVICE) {
      return { allowed: false, reason: 'device' }
    }
  }

  if (ip && ip !== 'unknown') {
    const { data } = await sb.from(table).select('user_id')
      .eq(scopeColumn, scopeValue).eq('voter_ip', ip).not('user_id', 'is', null)
    const accounts = new Set((data || []).map((r: any) => String(r.user_id)))
    if (!accounts.has(String(userId)) && accounts.size >= MAX_ACCOUNTS_PER_IP) {
      return { allowed: false, reason: 'ip' }
    }
  }

  return { allowed: true }
}

/**
 * Anon balso dedup pagal fingerprint (papildo IP dedup): kiek anon balsų iš šio
 * fingerprint'o jau yra duotam scope+target. Grąžina jau esamų kiekį.
 */
export async function anonFingerprintCount(opts: {
  table: 'top_votes' | 'voting_votes' | 'daily_song_votes'
  scopeColumn: string
  scopeValue: number | string
  targetColumn: string
  targetValue: number | string
  fingerprint: string
}): Promise<number> {
  const { table, scopeColumn, scopeValue, targetColumn, targetValue, fingerprint } = opts
  if (!fingerprint || fingerprint.length < 8) return 0
  const sb = createAdminClient()
  const { count } = await sb.from(table)
    .select('id', { count: 'exact', head: true })
    .eq(scopeColumn, scopeValue)
    .eq(targetColumn, targetValue)
    .eq('voter_fingerprint', fingerprint)
    .is('user_id', null)
  return count || 0
}
