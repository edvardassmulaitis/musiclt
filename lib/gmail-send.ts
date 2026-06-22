/**
 * Gmail siuntimas per Gmail API (gmail.send scope).
 *
 * Naudojama kaip transakcinio pašto transportas, kai NĖRA verifikuoto Resend
 * domeno (pvz. dar nevaldom music.lt). Siunčia per autentifikuotą Gmail paskyrą
 * (music.lt.naujienos@gmail.com ar pan.) — veikia į BET KOKĮ gavėją be domeno
 * verifikacijos. Limitai: ~500 laiškų/dieną (free Gmail), ~2000 (Workspace).
 *
 * VIENKARTINIS SETUP'AS (Edvardas):
 *   1. Google Cloud Console → tas pats OAuth Client kaip news-poll'ui.
 *   2. Per-autorizuoti refresh token'ą su scope'ais:
 *        https://www.googleapis.com/auth/gmail.readonly
 *        https://www.googleapis.com/auth/gmail.modify
 *        https://www.googleapis.com/auth/gmail.send   ← NAUJAS
 *      (visi kartu, kad nesulūžtų news polling, kuris naudoja tą patį token'ą.)
 *   3. Atnaujinti GOOGLE_REFRESH_TOKEN Vercel'e.
 *   4. Nustatyti env:
 *        EMAIL_TRANSPORT=gmail
 *        GMAIL_FROM="Music.lt <music.lt.naujienos@gmail.com>"  (adresas = autorizuota paskyra)
 *
 * Refresh token'as long-lived; tas pats GOOGLE_CLIENT_ID/SECRET kaip gmail-client.ts.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

let _cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 30_000) {
    return _cachedToken.accessToken
  }
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail send: missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gmail send OAuth refresh failed: ${res.status} ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  _cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
  return data.access_token
}

/** base64url (be padding'o) — Gmail API `raw` formatas. */
function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 2047 encoded-word UTF-8 header'iui (subject, display name). */
function encodeHeaderWord(value: string): string {
  // ASCII-only → paliekam kaip yra (greičiau ir skaitomiau).
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

/**
 * Sudaro RFC 822 MIME žinutę ir išsiunčia per Gmail API.
 * `from` privalo būti autorizuotos Gmail paskyros adresas (arba „send as" alias).
 */
export async function sendViaGmail(opts: {
  to: string
  subject: string
  html: string
  from?: string
  replyTo?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const from = opts.from || process.env.GMAIL_FROM || process.env.EMAIL_FROM || 'Music.lt <noreply@music.lt>'
    // Atskiriam display-name nuo adreso, kad galėtume encode'inti vardą su LT raidėmis.
    const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
    const fromHeader = m
      ? `${encodeHeaderWord(m[1].replace(/^"|"$/g, ''))} <${m[2]}>`
      : from

    const headers = [
      `From: ${fromHeader}`,
      `To: ${opts.to}`,
      `Subject: ${encodeHeaderWord(opts.subject)}`,
      ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ].join('\r\n')

    // Body base64, suskaidytas 76 simbolių eilutėmis (RFC).
    const bodyB64 = Buffer.from(opts.html, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
    const raw = base64url(Buffer.from(`${headers}\r\n\r\n${bodyB64}`, 'utf-8'))

    const token = await getAccessToken()
    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })
    if (!res.ok) {
      const detail = await res.text()
      return { ok: false, error: `gmail_send_${res.status}: ${detail.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'gmail_send_failed' }
  }
}
