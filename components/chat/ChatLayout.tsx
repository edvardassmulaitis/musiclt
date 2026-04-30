'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChatMessage, ConversationDetail, ConversationListItem } from '@/lib/chat-types'
import { ConversationSidebar, type DiscussionItem } from './ConversationSidebar'
import { MessagePane } from './MessagePane'
import { ThreadPanel } from './ThreadPanel'
import { NewConversationModal } from './NewConversationModal'
import { ConversationSettingsModal } from './ConversationSettingsModal'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'

// Mobile breakpoint — žemiau šito mato vienu metu vieną panel'į (sidebar
// arba pane). Slack mobile naudoja ~768px slenkstį.
const MOBILE_BREAKPOINT = 768

type Props = {
  viewerId: string
  initialConversations: ConversationListItem[]
  activeConversation?: ConversationDetail | null
  initialMessages?: ChatMessage[]
}

export function ChatLayout({ viewerId, initialConversations, activeConversation, initialMessages }: Props) {
  const router = useRouter()
  const [conversations, setConversations] = useState(initialConversations)
  const [discussions, setDiscussions] = useState<DiscussionItem[]>([])
  const [showNewModal, setShowNewModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [openThreadId, setOpenThreadId] = useState<number | null>(null)
  const [conv, setConv] = useState(activeConversation || null)

  // Sync prop -> state kai keičiasi route'as.
  useEffect(() => { setConv(activeConversation || null); setOpenThreadId(null) }, [activeConversation])
  useEffect(() => { setConversations(initialConversations) }, [initialConversations])

  // Diskusijos load — fetch'inam paraleliai su layout'u (ne SSR'inta).
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/my-discussions').then(r => r.json()).then(json => {
      if (cancelled) return
      setDiscussions(json.discussions || [])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

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

  // Mobile state — kontroliuoja kuris panel'as matomas (sidebar | pane).
  // Desktop'e abu visada matomi.
  const [showSidebarMobile, setShowSidebarMobile] = useState(true)
  useEffect(() => {
    // Kai user'is pasirinko pokalbį → mobile slepiam sidebar'ą.
    if (conv) setShowSidebarMobile(false)
    else setShowSidebarMobile(true)
  }, [conv?.id])

  return (
    <>
      <style>{`
        .chat-shell {
          display: flex;
          height: calc(100vh - 56px);
          background: var(--bg-body);
          overflow: hidden;
        }
        .chat-sidebar-wrap { display: flex; flex-shrink: 0; height: 100%; }
        .chat-pane-wrap    { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; }
        .chat-thread-wrap  { display: flex; flex-shrink: 0; height: 100%; }

        @media (max-width: ${MOBILE_BREAKPOINT - 1}px) {
          .chat-shell { position: relative; }
          .chat-sidebar-wrap.is-mobile-hidden { display: none; }
          .chat-sidebar-wrap.is-mobile-visible {
            width: 100% !important;
            max-width: none !important;
            position: absolute; inset: 0; z-index: 5;
          }
          .chat-pane-wrap.is-mobile-hidden { display: none; }
          .chat-pane-wrap.is-mobile-visible {
            position: absolute; inset: 0; z-index: 6;
          }
          .chat-thread-wrap {
            position: fixed !important;
            top: 56px; left: 0; right: 0; bottom: 0;
            width: 100% !important;
            z-index: 100;
          }
          .chat-mobile-back-btn { display: inline-flex !important; }
        }
      `}</style>

      <div className="chat-shell">
        <div className={`chat-sidebar-wrap ${showSidebarMobile ? 'is-mobile-visible' : 'is-mobile-hidden'}`}>
          <ConversationSidebar
            viewerId={viewerId}
            conversations={conversations}
            discussions={discussions}
            activeId={conv?.id || null}
            onNewConversation={() => setShowNewModal(true)}
          />
        </div>

        <div className={`chat-pane-wrap ${conv ? 'is-mobile-visible' : 'is-mobile-hidden'}`}>
          {conv ? (
            <MessagePane
              conversation={conv}
              viewerId={viewerId}
              initialMessages={initialMessages || []}
              onOpenThread={(id) => setOpenThreadId(id)}
              onOpenSettings={() => setShowSettings(true)}
              onMobileBack={() => { router.push('/pokalbiai'); setShowSidebarMobile(true) }}
            />
          ) : (
            <EmptyState onNew={() => setShowNewModal(true)} />
          )}
        </div>

        {conv && openThreadId && (
          <div className="chat-thread-wrap">
            <ThreadPanel
              messageId={openThreadId}
              conversationId={conv.id}
              viewerId={viewerId}
              onClose={() => setOpenThreadId(null)}
            />
          </div>
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
    </>
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
