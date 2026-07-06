// ─────────────────────────────────────────────────────────────────────────
// Rate limiting helper — Supabase-backed fixed-window skaitliukas (atominis RPC).
//
// Veikia serverless aplinkoje (bendras store, ne in-memory Map). Fail-OPEN:
// jei DB nepasiekiamas, praleidžiam (neklupdom teisėtų vartotojų dėl infra),
// bet log'inam. Naudojimas:
//
//   const ok = await rateLimit(`ml:${email}`, 3, 3600)   // 3 / val.
//   if (!ok) return NextResponse.json({ error: 'Per daug užklausų' }, { status: 429 })
// ─────────────────────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase'

/**
 * Kliento IP. Renkamės Vercel-patikimą `x-real-ip` (platformos nustatytas, kliento
 * neperrašomas). `x-forwarded-for` KAIRYSIS įrašas yra kliento kontroliuojamas
 * (galima spoof'inti ir apeiti IP rate-limit'ą), todėl jį naudojam tik kaip
 * fallback'ą ir imam DEŠINĮJĮ (patikimo proxy pridėtą) įrašą.
 */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers)
}

/** Kaip clientIp, bet iš Headers objekto (pvz. next/headers `await headers()`). */
export function clientIpFromHeaders(h: { get(name: string): string | null }): string {
  const realIp = h.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const xff = h.get('x-forwarded-for') || ''
  const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'unknown'
}

/**
 * Grąžina true jei leidžiama, false jei limitas viršytas.
 * @param key     unikalus raktas (pvz. `ml:email` arba `ai:ip:1.2.3.4`)
 * @param max     maks. užklausų per langą
 * @param windowSec  lango trukmė sekundėmis
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_key: key.slice(0, 200),
      p_max: max,
      p_window_sec: windowSec,
    })
    if (error) {
      console.error('[rate-limit] RPC error (fail-open):', error.message)
      return true
    }
    return data === true
  } catch (e: any) {
    console.error('[rate-limit] exception (fail-open):', e?.message || e)
    return true
  }
}

/** Patogumas: tikrina kelis raktus (pvz. per-email IR per-IP); false jei bet kuris viršytas. */
export async function rateLimitAll(
  checks: Array<{ key: string; max: number; windowSec: number }>,
): Promise<boolean> {
  const results = await Promise.all(checks.map((c) => rateLimit(c.key, c.max, c.windowSec)))
  return results.every(Boolean)
}
