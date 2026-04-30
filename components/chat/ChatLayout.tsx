'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChatMessage, ConversationDetail, ConversationListItem } from '@/lib/chat-types'
import { ConversationSidebar } from './ConversationSidebar'
import { MessagePane } from './MessagePane'
import { ThreadPanel } from './ThreadPanel'
import { NewConversationModal } from './NewConversationModal'
import { ConversationSettingsModal } from './ConversationSettingsModal'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'

type Props = {
  viewerId: string
  initialConversations: ConversationListItem[]
  activeConversation?: ConversationDetail | null
  initialMessages?: ChatMessage[]
}

export function ChatLayout({ viewerId, initialConversations, activeConversation, initialMessages }: Props) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [openThreadId, setOpenThreadId] = useState<number | null>(null)
  const [conv, setConv] = useState(activeConversation || null)

  // Sync prop -> state kai keičiasi route'as.
  useEffect(() => { setConv(activeConversation || null); setOpenThreadId(null) }, [activeConversation])
  useEffect(() => { setConversations(initialConversations) }, [initialConversations])

  async function refreshConversations() {
    try {
      const res = await fetch('/api/chat/conversations')
      const json = await res.json()
      setConversations(json.conversations || [])
    } catch { /* noop */ }
  }

  async function refreshConversationDetail() {
    if (!conv) return
    try {
      const res = await fetch(`/api/chat/conversations/${conv.id}`)
      const json = await res.json()
      if (!res.ok) return
      setConv(json)
    } catch { /* noop */ }
  }

  const handleAnyNewMessage = useCallback(async (_row: any) => {
    // Bumpinam sidebar feed'ą.
    refreshConversations()
  }, [])

  const handleParticipantChange = useCallback(() => {
    refreshConversations()
  }, [])

  const handleConversationChange = useCallback(() => {
    refreshConversations()
  }, [])

  useGlobalChatRealtime({
    viewerId,
    onAnyNewMessage: handleAnyNewMessage,
    onParticipantChange: handleParticipantChange,
    onConversationChange: handleConversationChange,
  })

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 56px)',  // 56 = SiteHeader height
      background: 'var(--bg-body)',
    }}>
      <ConversationSidebar
        viewerId={viewerId}
        conversations={conversations}
        activeId={conv?.id || null}
        onNewConversation={() => setShowNewModal(true)}
      />

      {conv ? (
        <>
          <MessagePane
            conversation={conv}
            viewerId={viewerId}
            initialMessages={initialMessages || []}
            onOpenThread={(id) => setOpenThreadId(id)}
            onOpenSettings={() => setShowSettings(true)}
          />
          {openThreadId && (
            <ThreadPanel
              messageId={openThreadId}
              conversationId={conv.id}
              viewerId={viewerId}
              onClose={() => setOpenThreadId(null)}
            />
          )}
        </>
      ) : (
        <EmptyState onNew={() => setShowNewModal(true)} />
      )}

      {showNewModal && <NewConversationModal onClose={() => setShowNewModal(false)} />}
      {showSettings && conv && (
        <ConversationSettingsModal
          conversation={conv}
          viewerId={viewerId}
          onClose={() => setShowSettings(false)}
          onUpdated={() => { refreshConversationDetail(); refreshConversations() }}
        />
      )}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
          Pasirink pokalbį
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 18 }}>
          Pasirink pokalbį iš kairės arba pradėk naują žinutę su kitu nariu / sukurk grupę.
        </p>
        <button
          onClick={onNew}
          style={{
            padding: '10px 18px', borderRadius: 9, border: 'none',
            background: 'var(--accent-orange)', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Naujas pokalbis
        </button>
      </div>
    </div>
  )
}
