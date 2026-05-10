// lib/notifications.ts
//
// In-app notification kūrimo helper'is. Visi backend code path'ai (comment
// POST, like POST, blog like, etc.) kviečiasi createNotification(...) — viena
// vieta validacijai, dedup'ui, error swallowing'ui.
//
// Defensyvi schema: jeigu `notifications` lentelės dar nėra (migracija
// neaplikuota prod'e), funkcija tiesiog returns'a — nieko neblokuoja.

import { createAdminClient } from '@/lib/supabase'

export type NotificationType =
  | 'comment_reply'         // kažkas atsakė į tavo komentarą
  | 'entity_comment'        // kažkas pakomentavo entity, kurį "valdai"
  | 'comment_like'          // kažkas palaikino tavo komentarą
  | 'blog_like'             // kažkas palaikino tavo blogo įrašą
  | 'blog_comment'          // kažkas pakomentavo tavo blogo įrašą
  | 'favorite_artist_track' // naujas track'as nuo mėgstamos grupės
  | 'daily_song_winner'     // tavo nominuotas track'as laimėjo dienos dainą
  | 'system'                // generic admin/system pranešimas

export interface CreateNotificationParams {
  user_id: string                      // recipient
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
 *   - notifications table doesn't exist yet
 *   - any DB error occurs (notifications must NEVER block the primary flow)
 */
export async function createNotification(p: CreateNotificationParams): Promise<void> {
  if (!p.user_id) return
  if (p.actor_id && p.user_id === p.actor_id) return

  try {
    const sb = createAdminClient()
    const row: any = {
      user_id: p.user_id,
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
