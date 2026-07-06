// ─────────────────────────────────────────────────────────────────────────
// Cloudflare Turnstile (bot/CAPTCHA) — serverio pusės verifikacija.
//
// ĮJUNGIAMA/IŠJUNGIAMA per env (pagal poreikį):
//   • TURNSTILE_SECRET_KEY nenustatytas → verifikacija NO-OP (praleidžia visus).
//   • Nustatytas → reikalauja galiojančio token'o iš kliento widget'o.
//   • Kliento pusėje: NEXT_PUBLIC_TURNSTILE_SITE_KEY + <TurnstileWidget/>.
//
// Gaukite raktus: Cloudflare dashboard → Turnstile → Add site (nemokama).
// ─────────────────────────────────────────────────────────────────────────

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** true, jei Turnstile sukonfigūruotas (env raktas yra). */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY
}

/**
 * Verifikuoja Turnstile token'ą. Jei Turnstile išjungtas (nėra secret'o) —
 * grąžina true (praleidžia). Fail-CLOSED kai įjungtas: be/su blogu token'u → false.
 */
export async function verifyTurnstile(token: string | undefined | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // išjungta → praleidžiam
  if (!token) return false

  try {
    const form = new URLSearchParams()
    form.set('secret', secret)
    form.set('response', token)
    if (ip) form.set('remoteip', ip)

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    })
    const data: any = await res.json()
    return data?.success === true
  } catch (e: any) {
    // Įjungus Turnstile, verifikacijos klaidą traktuojam kaip nesėkmę (fail-closed).
    console.error('[turnstile] verify error:', e?.message || e)
    return false
  }
}
