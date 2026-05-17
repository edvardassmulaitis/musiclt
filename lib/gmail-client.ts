/**
 * Gmail API client minimal — naudoja OAuth refresh token (long-lived) atrasti
 * naujus access token'us per poll'inimą.
 *
 * Setup'as (vienkartinis, žr. docs/GMAIL_SETUP.md):
 *   1. Google Cloud Console → Enable Gmail API
 *   2. OAuth 2.0 Client ID (Web Application)
 *   3. Authorize gmail.readonly + gmail.modify (apply label)
 *   4. Get refresh_token iš OAuth Playground arba script
 *   5. Set Vercel env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *
 * Naudojama TIK iš /api/internal/gmail-poll endpoint'o (cron).
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

let _cachedToken: { accessToken: string; expiresAt: number } | null = null

/**
 * Refresh access token jeigu cached pasibaigęs arba pirmasis call'as.
 * Access token galioja ~1h, refresh — long-lived (kol user'is nepanaikina).
 */
async function getAccessToken(): Promise<string> {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 30_000) {
    return _cachedToken.accessToken
  }
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials missing: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN')
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
    throw new Error(`Gmail OAuth refresh failed: ${res.status} ${detail.slice(0, 200)}`)
  }
  const data = await res.json()
  _cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
  return data.access_token
}

async function gmailFetch(path: string, init: RequestInit = {}): Promise<any> {
  const token = await getAccessToken()
  const url = `${GMAIL_API}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gmail API ${path} HTTP ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json()
}

export type GmailMessageMeta = {
  id: string
  threadId: string
}

/**
 * List unread messages inbox'e. Optional query filter (Gmail search syntax).
 * Default: 'is:unread in:inbox' — naujus laiškus.
 */
export async function listUnreadMessages(maxResults = 20, query = 'is:unread in:inbox'): Promise<GmailMessageMeta[]> {
  const data = await gmailFetch(
    `/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
  )
  return (data.messages || []) as GmailMessageMeta[]
}

export type GmailMessage = {
  id: string
  threadId: string
  from: string
  subject: string
  body: string         // plain text (HTML parts converted)
  receivedAt: string   // ISO date
  labelIds: string[]
}

/**
 * Parse multipart message → plain text body. Naudoja text/plain part jei yra,
 * fallback į HTML stripped.
 */
function decodeBody(payload: any): string {
  // Recursive — Gmail multipart messages turi parts[] tree
  const collect = (node: any): { plain: string; html: string } => {
    let plain = ''
    let html = ''
    if (!node) return { plain, html }
    if (node.body?.data) {
      const decoded = Buffer.from(node.body.data, 'base64').toString('utf-8')
      if (node.mimeType === 'text/plain') plain += decoded
      else if (node.mimeType === 'text/html') html += decoded
    }
    if (Array.isArray(node.parts)) {
      for (const p of node.parts) {
        const r = collect(p)
        plain += r.plain
        html += r.html
      }
    }
    return { plain, html }
  }
  const { plain, html } = collect(payload)
  if (plain.trim()) return plain.trim()
  // HTML fallback — strip tags
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const data = await gmailFetch(`/messages/${id}?format=full`)
  const headers: Array<{ name: string; value: string }> = data.payload?.headers || []
  const hFind = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''
  const internalDate = data.internalDate ? new Date(parseInt(data.internalDate, 10)).toISOString() : ''
  return {
    id: data.id,
    threadId: data.threadId,
    from: hFind('from'),
    subject: hFind('subject'),
    body: decodeBody(data.payload),
    receivedAt: internalDate,
    labelIds: data.labelIds || [],
  }
}

/**
 * Gauk thread'o info'ją su messages sąrašu (ID'ais). Naudojam backfill'ui,
 * kur turim tik thread_id (iš news_candidates.source_email_thread_id) ir
 * reikia message_id'o attachment fetch'ui.
 */
export async function getThread(threadId: string): Promise<{ id: string; messages: Array<{ id: string }> }> {
  const data = await gmailFetch(`/threads/${threadId}?format=minimal`)
  return {
    id: data.id,
    messages: (data.messages || []).map((m: any) => ({ id: m.id })),
  }
}

/**
 * Attachment metadata iš message payload tree.
 * `body.attachmentId` egzistuoja tik attachment part'uose (inline + file).
 */
export type GmailAttachmentMeta = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  inline: boolean  // Content-Disposition: inline
}

function extractAttachments(payload: any): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = []
  const walk = (node: any): void => {
    if (!node) return
    const headers: Array<{ name: string; value: string }> = node.headers || []
    const hFind = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || ''
    const aid = node.body?.attachmentId
    if (aid) {
      const disp = hFind('content-disposition').toLowerCase()
      out.push({
        attachmentId: aid,
        filename: node.filename || hFind('content-disposition').match(/filename="?([^";]+)"?/i)?.[1] || 'attachment',
        mimeType: node.mimeType || 'application/octet-stream',
        size: node.body?.size || 0,
        inline: disp.includes('inline'),
      })
    }
    if (Array.isArray(node.parts)) {
      for (const p of node.parts) walk(p)
    }
  }
  walk(payload)
  return out
}

/**
 * Sąrašas attachment'ų message'e — metadata only (filename, mime, size, id).
 * Content gaunamas atskirai per getAttachmentBuffer().
 */
export async function getMessageAttachments(messageId: string): Promise<GmailAttachmentMeta[]> {
  const data = await gmailFetch(`/messages/${messageId}?format=full`)
  return extractAttachments(data.payload)
}

/**
 * Atsiunčia atskiro attachment'o base64 content'ą ir grąžina Buffer'į.
 */
export async function getAttachmentBuffer(
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const data = await gmailFetch(`/messages/${messageId}/attachments/${attachmentId}`)
  // Gmail API grąžina urlsafe base64 — reikia transform'inti į standard.
  const raw: string = data.data || ''
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64')
}

/**
 * Apply label + mark as read. Idempotent — duomenims OK net jei jau aplikuota.
 *
 * Naudojam:
 *   - addLabelIds: ['Label_X'] (turime sukurt label'į iš anksto)
 *   - removeLabelIds: ['UNREAD'] (system label)
 */
export async function applyLabelAndRead(messageId: string, labelId?: string): Promise<void> {
  const body: any = { removeLabelIds: ['UNREAD'] }
  if (labelId) body.addLabelIds = [labelId]
  await gmailFetch(`/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * List label'us. Naudoja vienkartinį setup'ui — randam label'į pagal name'ą.
 */
export async function findLabelId(labelName: string): Promise<string | null> {
  const data = await gmailFetch('/labels')
  const label = (data.labels || []).find((l: any) => l.name === labelName)
  return label?.id || null
}

/**
 * Sukurt label'į jei nėra. Idempotent — jei jau yra, grąžinam existing id.
 */
export async function ensureLabel(labelName: string): Promise<string> {
  const existing = await findLabelId(labelName)
  if (existing) return existing
  const data = await gmailFetch('/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  })
  return data.id
}
