// Shared TS tipai chat UI'ui (client + server).

export type ConversationType = 'dm' | 'group'

export type ChatParticipantSummary = {
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
  participants: ChatParticipantSummary[]
}

export type ChatReaction = {
  emoji: string
  count: number
  user_ids: string[]
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
  author?: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
  reactions?: ChatReaction[]
  // Optimistinis state — kai siunčiama bet dar negauta atgal.
  pending?: boolean
  // Optimistic ID — jei pranešimas buvo replaced. Naudojama dedup'ui kai
  // atvyksta postgres_changes su tikra ID.
  client_id?: string
}

export type ConversationDetail = {
  id: number
  type: ConversationType
  name: string | null
  photo_url: string | null
  topic: string | null
  created_by: string | null
  created_at: string
  last_message_at: string
  me: {
    user_id: string
    role: 'member' | 'admin'
    last_read_at: string
    notifications_muted: boolean
  }
  participants: Array<{
    user_id: string
    role: 'member' | 'admin'
    joined_at: string
    left_at: string | null
    last_read_at: string
    notifications_muted: boolean
    profile: {
      id: string
      username: string | null
      full_name: string | null
      avatar_url: string | null
    } | null
  }>
}

// Pagalbinė: pavadinimui — DM atveju kito vartotojo vardas; grupei — name.
// Defensive: jei participants kažkodėl undefined / ne masyvas — naudojam [].
export function conversationDisplayName(c: { type: ConversationType; name: string | null; participants?: ChatParticipantSummary[] | null }, viewerId: string): string {
  if (c.type === 'group') return c.name?.trim() || 'Grupė be pavadinimo'
  const parts = Array.isArray(c.participants) ? c.participants : []
  const other = parts.find(p => p.user_id !== viewerId)
  if (!other) return 'Pokalbis'
  return other.full_name || other.username || 'Vartotojas'
}

export function conversationDisplayAvatar(c: { type: ConversationType; photo_url: string | null; participants?: ChatParticipantSummary[] | null }, viewerId: string): string | null {
  if (c.type === 'group') return c.photo_url || null
  const parts = Array.isArray(c.participants) ? c.participants : []
  const other = parts.find(p => p.user_id !== viewerId)
  return other?.avatar_url || null
}
