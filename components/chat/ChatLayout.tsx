'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ChatMessage, ConversationDetail, ConversationListItem } from '@/lib/chat-types'
import { ConversationSidebar, type DiscussionItem, type SidebarTab } from './ConversationSidebar'
import { MessagePane } from './MessagePane'
import { ThreadPanel } from './ThreadPanel'
import { NewConversationModal } from './NewConversationModal'
import { ConversationSettingsModal } from './ConversationSettingsModal'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'

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

  // Sidebar tab — 'private' rodo DM/grupes, 'discussions' rodo forumo
  // diskusijas, kuriose user'is dalyvavo. Persist'inam į localStorage.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('private')
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat:sidebarTab')
      if (saved === 'private' || saved === 'discussions') setSidebarTab(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('chat:sidebarTab', sidebarTab) } catch {}
  }, [sidebarTab])

  // Mobile detection — JS-driven, ne media query, kad galėtume cleanly
  // valdyti kuris panel'as matomas. Mobile <768px.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Sync prop -> state kai keičiasi route'as.
  useEffect(() => { setConv(activeConversation || null); setOpenThreadId(null) }, [activeConversation])
  useEffect(() => { setConversations(initialConversations) }, [initialConversations])

  // Diskusijos load.
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

  const handleAnyNewMessage = useCallback(() => { refreshConversations() }, [])
  const handleParticipantChange = useCallback(() => { refreshConversations() }, [])
  const handleConversationChange = useCallback(() => { refreshConversations() }, [])

  useGlobalChatRealtime({
    viewerId,
    onAnyNewMessage: handleAnyNewMessage,
    onParticipantChange: handleParticipantChange,
    onConversationChange: handleConversationChange,
  })

  // Mobile view'as: 'list' (sidebar matomas, pane paslėptas) vs 'detail'
  // (pane matomas, sidebar paslėptas). Synced su `conv` state'u — kai pasirinki
  // pokalbį, automatiškai pereinam į detail view'ą; back button grąžina į list.
  const mobileView: 'list' | 'detail' = conv ? 'detail' : 'list'

  // CSS tokens — apskaičiuojam Once per render'ą. Naudojam JS classes vietoj
  // media queries su !important (anksčiau buvo flaky kai parent header turi
  // backdrop-filter).
  const sidebarStyle: React.CSSProperties = isMobile
    ? (mobileView === 'list'
        ? { width: '100%', flexShrink: 0, height: '100%', display: 'flex' }
        : { display: 'none' })
    : { width: 300, flexShrink: 0, height: '100%', display: 'flex' }

  const paneStyle: React.CSSProperties = isMobile
    ? (mobileView === 'detail'
        ? { flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }
        : { display: 'none' })
    : { flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 56px)',
      background: 'var(--bg-body)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={sidebarStyle}>
        <ConversationSidebar
          viewerId={viewerId}
          conversations={conversations}
          discussions={discussions}
          activeId={conv?.id || null}
          onNewConversation={() => setShowNewModal(true)}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
        />
      </div>

      <div style={paneStyle}>
        {conv ? (
          <MessagePane
            conversation={conv}
            viewerId={viewerId}
            initialMessages={initialMessages || []}
            onOpenThread={(id) => setOpenThreadId(id)}
            onOpenSettings={() => setShowSettings(true)}
            onMobileBack={() => { router.push('/pokalbiai') }}
          />
        ) : (
          !isMobile && <EmptyState onNew={() => setShowNewModal(true)} />
        )}
      </div>

      {conv && openThreadId && (
        <ThreadPanelWrapper isMobile={isMobile}>
          <ThreadPanel
            messageId={openThreadId}
            conversationId={conv.id}
            viewerId={viewerId}
            onClose={() => setOpenThreadId(null)}
          />
        </ThreadPanelWrapper>
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

function ThreadPanelWrapper({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  if (isMobile) {
    return (
      <div style={{
        position: 'fixed', top: 56, left: 0, right: 0, bottom: 0,
        zIndex: 100, background: 'var(--bg-body)',
        display: 'flex', flexDirection: 'column',
      }}>
        {children}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexShrink: 0, height: '100%' }}>
      {children}
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
