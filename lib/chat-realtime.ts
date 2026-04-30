// Client-side realtime hook'ai per Supabase Realtime.
//
// Naudojam anon key + filter'us pagal conversation_id. Channel'iai:
//
//   chat:conv:<id>            postgres_changes ON chat_messages WHERE conversation_id=<id>
//                              + broadcast 'typing'
//                              + presence: kas šiuo metu žiūri pokalbį
//   chat:user:<userId>        postgres_changes ON chat_participants WHERE user_id=<userId>
//                              (last_read_at, naujas pokalbis)
//   chat:user:<userId>:msgs   postgres_changes ON chat_messages (no filter — global)
//                              ant kliento sufiltruojam pagal mūsų convos.
//
// Pastaba: anon key be RLS — bet kuris klientas gali subscribe'inti į bet kurį
// channel'į. Saugumas remiasi tuo, kad UI eina tik per /api/chat/* (RPC ir
// API gating). Realtime srautas tik notifies — pati paslaptis (žinučių
// turinys) yra paviešinta su tais, kas žino conversation ID.

'use client'

import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useRef, useState, useCallback } from 'react'

// Singleton client'as (vienas WS connection visam app'ui).
let _client: ReturnType<typeof createClient> | null = null
function realtimeClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  _client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  })
  return _client
}

// ─────────────────────────────────────────────────────────────────
// useConversationRealtime — naujos žinutės + typing + presence
// ─────────────────────────────────────────────────────────────────
export function useConversationRealtime(opts: {
  conversationId: number | null
  viewerId: string | null
  onInsert?: (row: any) => void
  onUpdate?: (row: any) => void
  onDelete?: (row: any) => void
  onReactionChange?: (row: any, kind: 'INSERT' | 'DELETE') => void
  onTyping?: (userId: string, viewerName: string) => void
}) {
  const { conversationId, viewerId, onInsert, onUpdate, onDelete, onReactionChange, onTyping } = opts
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [presence, setPresence] = useState<string[]>([])

  useEffect(() => {
    if (!conversationId || !viewerId) return
    const client = realtimeClient()
    if (!client) return

    const channelName = `chat:conv:${conversationId}`
    const ch = client.channel(channelName, {
      config: { presence: { key: viewerId } },
    })

    ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert?.(payload.new),
    )
    ch.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onUpdate?.(payload.new),
    )
    ch.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onDelete?.(payload.old),
    )
    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_reactions' },
      (payload) => onReactionChange?.(payload.new, 'INSERT'),
    )
    ch.on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'chat_reactions' },
      (payload) => onReactionChange?.(payload.old, 'DELETE'),
    )

    ch.on('broadcast', { event: 'typing' }, (payload) => {
      const u = payload?.payload?.user_id
      const n = payload?.payload?.name || ''
      if (u && u !== viewerId) onTyping?.(u, n)
    })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, any>
      setPresence(Object.keys(state))
    })

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ user_id: viewerId, joined_at: new Date().toISOString() })
      }
    })

    channelRef.current = ch
    return () => {
      ch.unsubscribe()
      channelRef.current = null
    }
  }, [conversationId, viewerId, onInsert, onUpdate, onDelete, onReactionChange, onTyping])

  const broadcastTyping = useCallback((name: string) => {
    const ch = channelRef.current
    if (!ch || !viewerId) return
    ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: viewerId, name } })
  }, [viewerId])

  return { presence, broadcastTyping }
}

// ─────────────────────────────────────────────────────────────────
// useGlobalChatRealtime — visiems user'io pokalbiams (sidebar feed
// + nav badge unread count). Klausomės chat_messages globaliai ir
// filtruojam ant kliento pagal convo IDs.
// ─────────────────────────────────────────────────────────────────
export function useGlobalChatRealtime(opts: {
  viewerId: string | null
  onAnyNewMessage?: (row: any) => void
  onParticipantChange?: (row: any) => void
  onConversationChange?: (row: any) => void
}) {
  const { viewerId, onAnyNewMessage, onParticipantChange, onConversationChange } = opts

  // Stabilizuojam callback'us per ref, kad effect nere'run'intų kiekvieną kartą
  // kai parent re-render'ina (anonimiškos arrow funkcijos kiekvienas render'as
  // — kitas reference). Be šito effect'as cleanup'ina kanalą + sukuria naują
  // ant kiekvieno render'o, ir tas yra brangu + sukėlė race'us su subscribe().
  const onMsgRef = useRef(onAnyNewMessage)
  const onPartRef = useRef(onParticipantChange)
  const onConvRef = useRef(onConversationChange)
  useEffect(() => { onMsgRef.current = onAnyNewMessage }, [onAnyNewMessage])
  useEffect(() => { onPartRef.current = onParticipantChange }, [onParticipantChange])
  useEffect(() => { onConvRef.current = onConversationChange }, [onConversationChange])

  // Unikalus channel name'as per hook instance — Supabase'o
  // `client.channel(name)` grąžina tą patį kanalą, jei vardas sutampa, o
  // tada pridėti naujus listener'ius PO `subscribe()` neleidžiama. Du
  // komponentai (pvz. MessagesBell + HomeChatsWidget) su tuo pačiu
  // viewerId fail'ino dėl šio. Random suffix'as garantuoja, kad
  // kiekvienas hook caller turi savo channel'į.
  const channelIdRef = useRef<string>(Math.random().toString(36).slice(2, 10))

  useEffect(() => {
    if (!viewerId) return
    const client = realtimeClient()
    if (!client) return

    const ch = client.channel(`chat:user:${viewerId}:${channelIdRef.current}`)

    ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (payload) => onMsgRef.current?.(payload.new),
    )
    ch.on('postgres_changes',
      { event: '*', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${viewerId}` },
      (payload) => onPartRef.current?.(payload.new || payload.old),
    )
    ch.on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_conversations' },
      (payload) => onConvRef.current?.(payload.new),
    )

    ch.subscribe()
    return () => { ch.unsubscribe() }
  }, [viewerId])
}
