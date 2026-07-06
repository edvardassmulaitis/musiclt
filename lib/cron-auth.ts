// ─────────────────────────────────────────────────────────────────────────
// Bendra cron/machine endpointų autentikacija.
//
// Priima TIK env-based paslaptis (CRON_SECRET / INTERNAL_CRON_TOKEN), niekada
// hardcoded. Vercel Cron automatiškai prideda `Authorization: Bearer <CRON_SECRET>`,
// kai CRON_SECRET nustatytas projekto env. Palyginimas — constant-time.
// ─────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Grąžina true, jei užklausa turi galiojantį Bearer token'ą (CRON_SECRET arba
 * INTERNAL_CRON_TOKEN). Priima ir `Authorization: Bearer <token>` header'į
 * (Vercel Cron), ir — jei `allowQueryKey` — `?key=<token>` (rankiniam trigger'iui).
 * Query key NIEKADA neturi būti hardcoded reikšmė; tik env paslaptis.
 */
export function authorizeCron(req: Request, opts: { allowQueryKey?: boolean } = {}): boolean {
  const secrets = [process.env.CRON_SECRET, process.env.INTERNAL_CRON_TOKEN].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  )
  if (secrets.length === 0) return false // fail closed: nesukonfigūruota → drausti

  const auth = req.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (bearer && secrets.some((s) => safeEqual(bearer, s))) return true

  if (opts.allowQueryKey) {
    try {
      const key = new URL(req.url).searchParams.get('key') || ''
      if (key && secrets.some((s) => safeEqual(key, s))) return true
    } catch {}
  }
  return false
}
