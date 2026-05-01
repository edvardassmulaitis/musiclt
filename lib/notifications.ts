// lib/notifications.ts
//
// In-app notification kūrimo helper'is. Visi backend code path'ai (comment
// POST, like POST, blog like, etc.) kviečiasi createNotification(...) — viena
// vieta validacijai, dedup'ui, error swallowing'ui.
//
// Defensyvi schema: jeigu `notifications` lentelės dar nėra (migracija
// neaplikuota prod'e), funkcija tiesiog returns'a — nieko neblokuoja.

import { createAdminClient } from '@/lib/supabase'
import { sendPushToUser } from '@/lib/web-push'

export type NotificationType =
  | 'comment_reply'         // kažkas atsakė į tavo komentarą
  | 'entity_comment'        // kažkas pakomentavo entity, kurį "valdai"
  | 'comment_like'          // kažkas palaikino tavo komentarą
  | 'blog_like'             // kažkas palaikino tavo blogo įrašą
  | 'blog_comment'          // kažkas pakomentavo tavo blogo įrašą
  | 'favorite_artist_track' // naujas track'as nuo mėgstamos grupės
  | 'daily_song_winner'     // tavo nominuotas track'as laimėjo dienos dainą
  | 'chat_message'          // nauja žinutė pokalbyje (DM/grupėje)
  | 'chat_reaction'         // kažkas pakomentavo emoji ant tavo žinutės
  | 'chat_thread_reply'     // kažkas atsakė į tavo žinutę thread'e
  | 'system'                // generic admin/system pranešimas

export interface CreateNotificationParams {
  user_id: string                      // recipient (gali būti stale po DB wipe'o)
  recipient_email?: string | null      // fallback: jei user_id stale, resolve per email
  type: NotificationType
  actor_id?: string | null
  actor_username?: string | null
  actor_full_name?: string | null
  actor_avatar_url?: string | null
  entity_type?: string | null
  entity_id?: number | string | null
  url?: string | null
  title?: string | null
  snippet?: string | null
  data?: Record<string, any> | null
}

/**
 * Create a notification row. No-op (returns silently) if:
 *   - user_id == actor_id (savaitis-self notification — niekam nereikia)
 *   - user disabled this notification type per `notification_preferences`
 *   - notifications table doesn't exist yet
 *   - any DB error occurs (notifications must NEVER block the primary flow)
 */
export async function createNotification(p: CreateNotificationParams): Promise<void> {
  if (!p.user_id && !p.recipient_email) return
  if (p.actor_id && p.user_id === p.actor_id) return

  try {
    const sb = createAdminClient()

    // ── 1. Validate recipient profile exists (handle UUID drift) ──────────
    // Po DB wipe'o stored user_id'iai gali rodyti į nebeegzistuojančius
    // profiles įrašus. Bandom resolveinti via email jeigu pirmasis fail'ina.
    let recipientId = p.user_id
    if (recipientId) {
      const { data: check } = await sb
        .from('profiles')
        .select('id')
        .eq('id', recipientId)
        .maybeSingle()
      if (!check) recipientId = '' // force fallback below
    }
    if (!recipientId && p.recipient_email) {
      const { data: byEmail } = await sb
        .from('profiles')
        .select('id')
        .eq('email', p.recipient_email)
        .maybeSingle()
      if (byEmail?.id) recipientId = byEmail.id as string
    }
    if (!recipientId) {
      console.warn('[notifications] cannot resolve recipient:', { user_id: p.user_id, email: p.recipient_email })
      return
    }

    // ── 2. Self-notification check (post-resolve, kad apima ir email path) ─
    if (p.actor_id && recipientId === p.actor_id) return

    // ── 3. Respect user preferences. Row absence = enabled (default). ─────
    try {
      const { data: pref } = await sb
        .from('notification_preferences')
        .select('enabled')
        .eq('user_id', recipientId)
        .eq('type', p.type)
        .maybeSingle() as { data: any }
      if (pref && pref.enabled === false) return
    } catch { /* table may not exist yet — proceed as enabled */ }

    const row: any = {
      user_id: recipientId,
      type: p.type,
      actor_id: p.actor_id || null,
      actor_username: p.actor_username || null,
      actor_full_name: p.actor_full_name || null,
      actor_avatar_url: p.actor_avatar_url || null,
      entity_type: p.entity_type || null,
      entity_id: p.entity_id != null ? Number(p.entity_id) : null,
      url: p.url || null,
      title: p.title || null,
      snippet: p.snippet ? p.snippet.slice(0, 280) : null,
      data: p.data || null,
    }
    const { error } = await sb.from('notifications').insert(row)
    if (error && !/relation .* does not exist/i.test(error.message)) {
      // Ne lentelės nebuvimo klaida — log'inam (bet vis tiek nesvaidom).
      console.error('[notifications] insert failed:', error.message)
    }
    // Update p.user_id so downstream push uses resolved id
    p.user_id = recipientId

    // ── Web Push: jeigu user'is įjungęs browser notifications ────────
    // Fire-and-forget. sendPushToUser silently grąžina 0 jei VAPID keys
    // nesukonfigūruoti arba user'is neturi push subs.
    try {
      const pushTitle = p.title || `${p.actor_full_name || p.actor_username || 'music.lt'}`
      const pushBody = p.snippet || ''
      await sendPushToUser(p.user_id, {
        title: pushTitle,
        body: pushBody,
        url: p.url || '/',
        // tag = type+entity → jeigu greitai pasikartoja (5 likes per minute),
        // browser collapse'ina į vieną notification (renotify=true sukels
        // skambutį, bet vienas item).
        tag: `${p.type}:${p.entity_type || 'global'}:${p.entity_id ?? ''}`,
        data: { type: p.type },
      })
    } catch (e: any) {
      console.warn('[notifications] push send failed:', e?.message || e)
    }
  } catch (e: any) {
    console.error('[notifications] unexpected error:', e?.message || e)
  }
}

/**
 * Resolve actor info from a session (or partial profile lookup) and create.
 * Convenience wrapper — handles the common case kur actor'as yra logged in
 * user + session jau turi name/email/image.
 */
export async function notifyFromSession(opts: {
  recipientUserId: string
  recipientEmail?: string | null     // fallback resolution path
  actorSession: { user?: { id?: string; name?: string | null; email?: string | null; image?: string | null } } | null
  type: NotificationType
  entity_type?: string | null
  entity_id?: number | string | null
  url?: string | null
  title?: string | null
  snippet?: string | null
  data?: Record<string, any> | null
}): Promise<void> {
  const u = opts.actorSession?.user
  return createNotification({
    user_id: opts.recipientUserId,
    recipient_email: opts.recipientEmail,
    type: opts.type,
    actor_id: u?.id || null,
    actor_username: u?.name || (u?.email ? u.email.split('@')[0] : null),
    actor_full_name: u?.name || null,
    actor_avatar_url: u?.image || null,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id,
    url: opts.url,
    title: opts.title,
    snippet: opts.snippet,
    data: opts.data,
  })
}
