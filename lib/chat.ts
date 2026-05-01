// lib/chat.ts
//
// Server-side helper'iai chat sistemai. Visi metodai naudoja
// createAdminClient() (service role) — RLS apie tai galvojam tik realtime
// kanaluose. Authorization daroma per user_id check'us API route'uose
// (assertParticipant ir t.t.).
//
// Public API:
//   • listMyConversations(userId)              — sidebar feed su unread
//   • getConversation(convId, userId)          — vienas pokalbis (viewer asserted)
//   • getOrCreateDM(userA, userB)              — randa arba sukuria DM
//   • createGroup(creatorId, name, memberIds)  — naujas grupinis pokalbis
//   • addParticipants(convId, byId, userIds)   — pridėti narius į grupę
//   • removeParticipant(convId, byId, userId)  — pašalinti narį
//   • leaveConversation(convId, userId)        — pasišalinti
//   • renameGroup(convId, byId, name, topic)   — pakeisti pavadinimą
//   • assertParticipant(convId, userId)        — guard'as API route'ams
//   • fetchMessages(convId, opts)              — paginate'inta history
//   • sendMessage(convId, userId, body, parent)— nauja žinutė
//   • editMessage(messageId, userId, body)     — edit (autorius only)
//   • deleteMessage(messageId, userId)         — soft delete
//   • toggleReaction(messageId, userId, emoji) — toggle 👍
//   • fetchThread(messageId)                   — root + replies
//   • markRead(convId, userId)                 — bumpinam last_read_at
//   • totalUnread(userId)                      — nav badge skaičius
//   • searchUsers(query, exceptUserId)         — naujam DM/grupei
//
// Naudojama API route'ais. Frontend'as kalbasi su API, ne čia.

import type { Session } from 'next-auth'
import { createAdminClient } from '@/lib/supabase'
import { resolveAuthorId } from '@/lib/resolve-author'

// Resolve'ina dabartinį prisijungusį vartotoją į profile.id. Naudojam
// resolveAuthorId, kuris dorai apdoroja:
//   - JWT id rodo į wiped profile (re-create per email lookup)
//   - DB ID drift po migracijos (email kaip stable backbone)
// Visi chat API endpoint'ai turi naudoti šitą — tiesioginis session.user.id
// neveikia po DB wipe'ų ir meta FK violation.
export async function resolveViewerId(session: Session | null): Promise<string | null> {
  if (!session?.user) return null
  const sb = createAdminClient()
  return resolveAuthorId(sb, session)
}

export type ConversationType = 'dm' | 'group'

export type Participant = {
  user_id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  role: 'member' | 'admin'
}

export type ConversationListItem = {
  id: number
  type: ConversationType
  name: string | null
  photo_url: string | null
  topic: string | null
  last_message_at: string
  last_message_id: number | null
  last_message_preview: string | null
  last_message_user_id: string | null
  last_read_at: string
  notifications_muted: boolean
  unread_count: number
  participants: Participant[]
}

export type ChatMessage = {
  id: number
  conversation_id: number
  user_id: string
  body: string
  parent_message_id: number | null
  reply_count: number
  last_reply_at: string | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  // Hydrated by API:
  author?: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
  reactions?: Array<{ emoji: string; count: number; user_ids: string[] }>
}

// ════════════════════════════════════════════════════════════════
// CONVERSATIONS
// ════════════════════════════════════════════════════════════════

export async function listMyConversations(userId: string): Promise<ConversationListItem[]> {
  const sb = createAdminClient()
  const { data, error } = await sb.rpc('chat_user_conversations', { p_user_id: userId })
  if (error) throw error
  return (data || []) as ConversationListItem[]
}

export async function totalUnread(userId: string): Promise<number> {
  const sb = createAdminClient()
  const { data, error } = await sb.rpc('chat_total_unread', { p_user_id: userId })
  if (error) throw error
  return Number(data) || 0
}

export async function getOrCreateDM(userA: string, userB: string): Promise<number> {
  if (userA === userB) throw new Error('Negalima rašyti pačiam sau')
  const sb = createAdminClient()
  const { data, error } = await sb.rpc('chat_get_or_create_dm', { p_user_a: userA, p_user_b: userB })
  if (error) throw error
  return Number(data)
}

export async function createGroup(opts: {
  creatorId: string
  name: string | null
  topic?: string | null
  memberIds: string[]
}): Promise<number> {
  const { creatorId, name, topic, memberIds } = opts
  const allMembers = Array.from(new Set([creatorId, ...memberIds]))
  if (allMembers.length < 2) throw new Error('Grupėje turi būti bent 2 nariai')

  const sb = createAdminClient()
  const { data: conv, error: cErr } = await sb
    .from('chat_conversations')
    .insert({
      type: 'group',
      name: name?.trim() || null,
      topic: topic?.trim() || null,
      created_by: creatorId,
    })
    .select('id')
    .single()
  if (cErr) throw cErr

  const rows = allMembers.map(uid => ({
    conversation_id: conv.id,
    user_id: uid,
    role: uid === creatorId ? 'admin' : 'member',
  }))
  const { error: pErr } = await sb.from('chat_participants').insert(rows)
  if (pErr) throw pErr

  return conv.id as number
}

export async function getConversation(convId: number, viewerId: string) {
  const sb = createAdminClient()
  const { data: conv, error } = await sb
    .from('chat_conversations')
    .select('id, type, name, photo_url, topic, created_by, created_at, last_message_at')
    .eq('id', convId)
    .single()
  if (error) throw error

  const { data: parts, error: pErr } = await sb
    .from('chat_participants')
    .select('user_id, role, joined_at, last_read_at, notifications_muted, left_at, profiles:user_id(id, username, full_name, avatar_url)')
    .eq('conversation_id', convId)
  if (pErr) throw pErr

  const me = (parts || []).find((p: any) => p.user_id === viewerId && !p.left_at)
  if (!me) {
    const err: any = new Error('Forbidden')
    err.code = 'FORBIDDEN'
    throw err
  }

  return {
    ...conv,
    me,
    participants: (parts || []).map((p: any) => ({
      user_id: p.user_id,
      role: p.role,
      joined_at: p.joined_at,
      left_at: p.left_at,
      last_read_at: p.last_read_at,
      notifications_muted: p.notifications_muted,
      profile: p.profiles,
    })),
  }
}

export async function assertParticipant(convId: number, userId: string): Promise<{ role: 'member' | 'admin' }> {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('chat_participants')
    .select('role, left_at')
    .eq('conversation_id', convId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data || data.left_at) {
    const err: any = new Error('Forbidden — ne pokalbio dalyvis')
    err.code = 'FORBIDDEN'
    throw err
  }
  return { role: data.role as 'member' | 'admin' }
}

async function assertGroupAdmin(convId: number, userId: string) {
  const sb = createAdminClient()
  const { data: conv } = await sb.from('chat_conversations').select('type').eq('id', convId).single()
  if (!conv) throw new Error('Pokalbis nerastas')
  if (conv.type !== 'group') {
    const err: any = new Error('Veiksmas leidžiamas tik grupėms')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const { role } = await assertParticipant(convId, userId)
  if (role !== 'admin') {
    const err: any = new Error('Tik grupės admin'); err.code = 'FORBIDDEN'; throw err
  }
}

export async function addParticipants(convId: number, byId: string, userIds: string[]) {
  await assertGroupAdmin(convId, byId)
  const sb = createAdminClient()
  const rows = userIds.map(uid => ({
    conversation_id: convId,
    user_id: uid,
    role: 'member' as const,
  }))
  // upsert — kad re-add po left'ų veiktų: išvalom left_at jei toks yra.
  const { error } = await sb.from('chat_participants').upsert(rows, { onConflict: 'conversation_id,user_id' })
  if (error) throw error
  // Po upsert'o atskira užklausa nuvaloma left_at + nustatomas joined_at iš naujo.
  await sb
    .from('chat_participants')
    .update({ left_at: null, joined_at: new Date().toISOString() })
    .in('user_id', userIds)
    .eq('conversation_id', convId)
}

export async function removeParticipant(convId: number, byId: string, userId: string) {
  await assertGroupAdmin(convId, byId)
  if (byId === userId) {
    const err: any = new Error('Negalima pašalinti pačiam savęs — naudok "palikti"')
    err.code = 'BAD_REQUEST'
    throw err
  }
  const sb = createAdminClient()
  const { error } = await sb
    .from('chat_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function leaveConversation(convId: number, userId: string) {
  await assertParticipant(convId, userId)
  const sb = createAdminClient()
  const { error } = await sb
    .from('chat_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function renameGroup(convId: number, byId: string, patch: { name?: string | null; topic?: string | null; photo_url?: string | null }) {
  await assertGroupAdmin(convId, byId)
  const sb = createAdminClient()
  const update: Record<string, any> = {}
  if (patch.name !== undefined)      update.name      = patch.name?.trim() || null
  if (patch.topic !== undefined)     update.topic     = patch.topic?.trim() || null
  if (patch.photo_url !== undefined) update.photo_url = patch.photo_url || null
  if (Object.keys(update).length === 0) return
  const { error } = await sb.from('chat_conversations').update(update).eq('id', convId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// MESSAGES
// ════════════════════════════════════════════════════════════════

const MESSAGE_PAGE = 50

export async function fetchMessages(opts: {
  convId: number
  viewerId: string
  beforeId?: number     // pagination — ID, kuris turi būti mažesnis
  limit?: number
}): Promise<ChatMessage[]> {
  await assertParticipant(opts.convId, opts.viewerId)
  const sb = createAdminClient()
  const lim = Math.min(opts.limit || MESSAGE_PAGE, 100)

  let q = sb
    .from('chat_messages')
    .select('id, conversation_id, user_id, body, parent_message_id, reply_count, last_reply_at, edited_at, deleted_at, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .eq('conversation_id', opts.convId)
    .is('parent_message_id', null)
    .order('id', { ascending: false })
    .limit(lim)

  if (opts.beforeId) q = q.lt('id', opts.beforeId)

  const { data, error } = await q
  if (error) throw error

  const messages = (data || []).map(hydrateMessage)
  await attachReactions(messages)
  // Reverse — chronologinė tvarka UI'ui (sena viršuje, nauja apačioje).
  return messages.reverse()
}

export async function sendMessage(opts: {
  convId: number
  userId: string
  body: string
  parentMessageId?: number | null
}): Promise<ChatMessage> {
  await assertParticipant(opts.convId, opts.userId)
  const body = (opts.body || '').trim()
  if (!body) throw new Error('Tuščia žinutė')
  if (body.length > 8000) throw new Error('Žinutė per ilga (max 8000 simbolių)')

  // Jei thread reply — patikrinam, kad parent priklauso šitam pokalbiui.
  if (opts.parentMessageId) {
    const sb = createAdminClient()
    const { data: parent } = await sb.from('chat_messages').select('conversation_id').eq('id', opts.parentMessageId).single()
    if (!parent || parent.conversation_id !== opts.convId) {
      throw new Error('Parent message not in this conversation')
    }
  }

  const sb = createAdminClient()
  const { data, error } = await sb
    .from('chat_messages')
    .insert({
      conversation_id:    opts.convId,
      user_id:            opts.userId,
      body,
      parent_message_id:  opts.parentMessageId || null,
    })
    .select('id, conversation_id, user_id, body, parent_message_id, reply_count, last_reply_at, edited_at, deleted_at, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .single()
  if (error) throw error

  // Auto-mark sender's last_read_at
  await sb
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', opts.convId)
    .eq('user_id', opts.userId)

  const hydrated = hydrateMessage(data)
  await attachReactions([hydrated])

  // Notifikacijos kitiems dalyviams (best-effort, neblokuoja žinutės). Sender'ė
  // nepasiekia savęs (createNotification praleidžia self-target). Thread'o atveju
  // tiesiogiai notify'inam parent autorių; top-level — notify'inam visus
  // pokalbio dalyvius (išskyrus sender'į).
  ;(async () => {
    try {
      const { createNotification } = await import('@/lib/notifications')
      const sender = hydrated.author
      const senderName = sender?.full_name || sender?.username || 'Vartotojas'
      const snippet = body.slice(0, 140)

      if (opts.parentMessageId) {
        // Thread reply — pranešam parent message autoriui.
        const { data: parentRow } = await sb
          .from('chat_messages')
          .select('user_id')
          .eq('id', opts.parentMessageId)
          .single()
        if (parentRow?.user_id && parentRow.user_id !== opts.userId) {
          await createNotification({
            user_id: parentRow.user_id,
            type: 'chat_thread_reply',
            actor_id: opts.userId,
            actor_username: sender?.username || null,
            actor_full_name: senderName,
            actor_avatar_url: sender?.avatar_url || null,
            entity_type: 'chat_message',
            entity_id: hydrated.id,
            url: `/pokalbiai/${opts.convId}`,
            title: `${senderName} atsakė į tavo žinutę`,
            snippet,
          })
        }
      } else {
        // Top-level — pranešam visiems pokalbio dalyviams (išskyrus sender'į ir
        // tuos kurie left/muted). Žinutės title priklauso nuo pokalbio tipo.
        const { data: parts } = await sb
          .from('chat_participants')
          .select('user_id, notifications_muted, left_at')
          .eq('conversation_id', opts.convId)

        const { data: conv } = await sb
          .from('chat_conversations')
          .select('type, name')
          .eq('id', opts.convId)
          .single()
        const where = conv?.type === 'group' ? ` (${conv.name || 'grupė'})` : ''

        for (const p of parts || []) {
          if (!p.user_id || p.user_id === opts.userId) continue
          if (p.left_at || p.notifications_muted) continue
          await createNotification({
            user_id: p.user_id,
            type: 'chat_message',
            actor_id: opts.userId,
            actor_username: sender?.username || null,
            actor_full_name: senderName,
            actor_avatar_url: sender?.avatar_url || null,
            entity_type: 'chat_conversation',
            entity_id: opts.convId,
            url: `/pokalbiai/${opts.convId}`,
            title: `Nauja žinutė nuo ${senderName}${where}`,
            snippet,
          })
        }
      }
    } catch { /* notifications must never block primary flow */ }
  })()

  return hydrated
}

export async function editMessage(messageId: number, userId: string, body: string): Promise<ChatMessage> {
  const trimmed = (body || '').trim()
  if (!trimmed) throw new Error('Tuščia žinutė')

  const sb = createAdminClient()
  const { data: existing } = await sb
    .from('chat_messages')
    .select('id, user_id, conversation_id, deleted_at')
    .eq('id', messageId)
    .single()
  if (!existing) throw new Error('Žinutė nerasta')
  if (existing.deleted_at) throw new Error('Negalima redaguoti ištrintos')
  if (existing.user_id !== userId) {
    const err: any = new Error('Tik autorius gali redaguoti'); err.code = 'FORBIDDEN'; throw err
  }

  const { data, error } = await sb
    .from('chat_messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id, conversation_id, user_id, body, parent_message_id, reply_count, last_reply_at, edited_at, deleted_at, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .single()
  if (error) throw error
  const hydrated = hydrateMessage(data)
  await attachReactions([hydrated])
  return hydrated
}

export async function deleteMessage(messageId: number, userId: string): Promise<void> {
  const sb = createAdminClient()
  const { data: existing } = await sb
    .from('chat_messages')
    .select('id, user_id, deleted_at')
    .eq('id', messageId)
    .single()
  if (!existing) throw new Error('Žinutė nerasta')
  if (existing.deleted_at) return
  if (existing.user_id !== userId) {
    const err: any = new Error('Tik autorius gali ištrinti'); err.code = 'FORBIDDEN'; throw err
  }
  const { error } = await sb
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', messageId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// REACTIONS
// ════════════════════════════════════════════════════════════════

export async function toggleReaction(messageId: number, userId: string, emoji: string): Promise<{ active: boolean }> {
  const e = (emoji || '').trim()
  if (!e || e.length > 16) throw new Error('Bloga emoji')

  const sb = createAdminClient()

  // Validacija — ar žinutė priklauso pokalbiui, kur user'is dalyvauja.
  // Užklausiam ir žinutės autorių, kad galėtume notify'inti po insert'o.
  const { data: msg } = await sb
    .from('chat_messages')
    .select('id, conversation_id, user_id, body, deleted_at')
    .eq('id', messageId)
    .single()
  if (!msg) throw new Error('Žinutė nerasta')
  if (msg.deleted_at) throw new Error('Žinutė ištrinta')
  await assertParticipant(msg.conversation_id, userId)

  const { data: existing } = await sb
    .from('chat_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', e)
    .maybeSingle()

  if (existing) {
    await sb
      .from('chat_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', e)
    return { active: false }
  }

  const { error } = await sb.from('chat_reactions').insert({ message_id: messageId, user_id: userId, emoji: e })
  if (error) throw error

  // Notification — message author (jei tai ne self-react). Kaip ir su naujomis
  // žinutėmis, change reaction (delete+insert) generuoja naują notification —
  // tas yra norimas elgesys (user'is sako "jeigu pakeicia emocija, taip pat").
  ;(async () => {
    try {
      if (msg.user_id && msg.user_id !== userId) {
        const { data: actor } = await sb
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .eq('id', userId)
          .maybeSingle()
        const actorName = actor?.full_name || actor?.username || 'Vartotojas'
        const { createNotification } = await import('@/lib/notifications')
        await createNotification({
          user_id: msg.user_id,
          type: 'chat_reaction',
          actor_id: userId,
          actor_username: actor?.username || null,
          actor_full_name: actorName,
          actor_avatar_url: actor?.avatar_url || null,
          entity_type: 'chat_message',
          entity_id: messageId,
          url: `/pokalbiai/${msg.conversation_id}`,
          title: `${actorName} sureagavo ${e} į tavo žinutę`,
          snippet: (msg.body || '').slice(0, 140),
          data: { emoji: e },
        })
      }
    } catch { /* notifications must never block primary flow */ }
  })()

  return { active: true }
}

// ════════════════════════════════════════════════════════════════
// THREADS
// ════════════════════════════════════════════════════════════════

export async function fetchThread(messageId: number, viewerId: string): Promise<{ root: ChatMessage; replies: ChatMessage[] }> {
  const sb = createAdminClient()
  const { data: root, error: rErr } = await sb
    .from('chat_messages')
    .select('id, conversation_id, user_id, body, parent_message_id, reply_count, last_reply_at, edited_at, deleted_at, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .eq('id', messageId)
    .single()
  if (rErr) throw rErr
  if (!root) throw new Error('Žinutė nerasta')
  await assertParticipant(root.conversation_id, viewerId)

  const { data: replies, error: repErr } = await sb
    .from('chat_messages')
    .select('id, conversation_id, user_id, body, parent_message_id, reply_count, last_reply_at, edited_at, deleted_at, created_at, profiles:user_id(id, username, full_name, avatar_url)')
    .eq('parent_message_id', messageId)
    .order('id', { ascending: true })
  if (repErr) throw repErr

  const all = [root, ...(replies || [])].map(hydrateMessage)
  await attachReactions(all)
  return { root: all[0], replies: all.slice(1) }
}

// ════════════════════════════════════════════════════════════════
// READ STATE
// ════════════════════════════════════════════════════════════════

export async function markRead(convId: number, userId: string): Promise<void> {
  const sb = createAdminClient()
  const { error } = await sb
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', convId)
    .eq('user_id', userId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════════
// USER SEARCH
// ════════════════════════════════════════════════════════════════

export async function searchUsers(query: string, exceptUserId: string, limit = 12) {
  const q = (query || '').trim()
  const sb = createAdminClient()

  let qb = sb
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .neq('id', exceptUserId)
    .limit(Math.min(limit, 20))

  if (q.length > 0) {
    // ILIKE match'as full_name + username
    qb = qb.or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
  } else {
    qb = qb.order('full_name', { ascending: true, nullsFirst: false })
  }

  const { data, error } = await qb
  if (error) throw error
  return data || []
}

// ════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ════════════════════════════════════════════════════════════════

function hydrateMessage(row: any): ChatMessage {
  const p = row.profiles
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    body: row.deleted_at ? '' : row.body,
    parent_message_id: row.parent_message_id,
    reply_count: row.reply_count || 0,
    last_reply_at: row.last_reply_at,
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    author: p ? {
      id: p.id,
      username: p.username,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
    } : undefined,
    reactions: [],
  }
}

async function attachReactions(messages: ChatMessage[]) {
  if (messages.length === 0) return
  const ids = messages.map(m => m.id)
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('chat_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', ids)
  if (error) return // non-fatal — reactions optional

  const byMsg = new Map<number, Map<string, Set<string>>>()
  for (const r of data || []) {
    if (!byMsg.has(r.message_id)) byMsg.set(r.message_id, new Map())
    const emap = byMsg.get(r.message_id)!
    if (!emap.has(r.emoji)) emap.set(r.emoji, new Set())
    emap.get(r.emoji)!.add(r.user_id)
  }

  for (const m of messages) {
    const emap = byMsg.get(m.id)
    if (!emap) { m.reactions = []; continue }
    m.reactions = Array.from(emap.entries()).map(([emoji, users]) => ({
      emoji,
      count: users.size,
      user_ids: Array.from(users),
    }))
  }
}
