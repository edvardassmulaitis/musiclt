'use client'

// HomeChatsWidget — homepage'o "Gyvi pokalbiai" dėžutė.
// Anksčiau čia buvo atskira ShoutboxWidget funkcija (legacy /api/live/shoutbox);
// po pokalbių sistemos sudiegimo (2026-04-30) integruojam į ją:
//
//   • Prisijungusiam — top 4 paskutiniai pokalbiai (DM + grupės) su last message
//     preview, unread badge'u, click → /pokalbiai/[id]
//   • Neprisijungusiam — promo CTA + "prisijunk" link'as
//   • Visada — link'as į /pokalbiai naujam pokalbiui pradėti
//
// Realtime: subscribe'inamės į global chat realtime, kad widget'as auto-refreshintųsi
// gavus naują žinutę (ne polling'as).

import { useEffect, useCallback, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useGlobalChatRealtime } from '@/lib/chat-realtime'
import {
  conversationDisplayName,
  conversationDisplayAvatar,
  type ConversationListItem,
} from '@/lib/chat-types'
import { formatSidebarTime } from '@/components/chat/ChatTime'
import { proxyImg } from '@/lib/img-proxy'

const MAX_ROWS = 4
const REFRESH_MS = 30_000  // fallback'as jei realtime atsijungtų

export function HomeChatsWidget() {
  const { data: session, status } = useSession()
  const userId = (session?.user as any)?.id || null
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    try {
      const res = await fetch('/api/chat/conversations', { cache: 'no-store' })
      const json = await res.json()
      setConversations(json.conversations || [])
    } catch { /* swallow */ }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => {
    if (status === 'loading') return
    refresh()
    if (!userId) return
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh, status, userId])

  // Realtime auto-refresh — kai bet kuri new žinutė ateina į user'io conv'us.
  useGlobalChatRealtime({
    viewerId: userId,
    onAnyNewMessage: () => refresh(),
    onConversationChange: () => refresh(),
    onParticipantChange: () => refresh(),
  })

  const isAuth = status === 'authenticated' && !!userId

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 16, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '11px 14px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
            Pokalbiai
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#22c55e', boxShadow: '0 0 6px #22c55e',
          }} />
        </div>
        <Link href="/pokalbiai" style={{
          fontSize: 10, color: 'var(--accent-link)', fontWeight: 700, textDecoration: 'none',
        }}>Visi →</Link>
      </div>

      {/* Body */}
      <div style={{ flex: 1 }}>
        {!isAuth ? (
          <SignInCTA />
        ) : loading ? (
          <SkeletonRows />
        ) : conversations.length === 0 ? (
          <EmptyState />
        ) : (
          conversations.slice(0, MAX_ROWS).map((c, i, arr) => (
            <ConvRow
              key={c.id}
              c={c}
              viewerId={userId!}
              isLast={i === Math.min(arr.length, MAX_ROWS) - 1}
            />
          ))
        )}
      </div>

      {/* Footer CTA */}
      <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border-subtle)' }}>
        <Link
          href="/pokalbiai"
          style={{
            display: 'block', textAlign: 'center', padding: '7px',
            borderRadius: 10, background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            color: 'var(--accent-link)', fontSize: 11, fontWeight: 700,
            textDecoration: 'none', transition: 'background .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-active)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        >
          {isAuth ? 'Atidaryti pokalbius →' : 'Prisijunk pradėti pokalbį →'}
        </Link>
      </div>
    </div>
  )
}

function ConvRow({ c, viewerId, isLast }: { c: ConversationListItem; viewerId: string; isLast: boolean }) {
  const name = conversationDisplayName(c, viewerId)
  const avatarUrl = conversationDisplayAvatar(c, viewerId)
  const unread = c.unread_count > 0
  const senderName = c.last_message_user_id === viewerId
    ? 'Tu'
    : c.participants.find(p => p.user_id === c.last_message_user_id)?.full_name?.split(' ')[0] || ''
  const preview = c.last_message_preview
    ? (senderName ? `${senderName}: ${c.last_message_preview}` : c.last_message_preview)
    : 'Dar nėra žinučių'

  return (
    <Link
      href={`/pokalbiai/${c.id}`}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{
        display: 'flex', gap: 9, padding: '8px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
        background: unread ? 'rgba(96,165,250,0.05)' : 'transparent',
        transition: 'background .12s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = unread ? 'rgba(96,165,250,0.05)' : 'transparent')}
      >
        <Avatar url={avatarUrl} name={name} group={c.type === 'group'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 1 }}>
            <span style={{
              fontSize: 11, fontWeight: unread ? 800 : 700,
              color: 'var(--accent-link)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '70%',
            }}>{name}</span>
            <span style={{ fontSize: 9, color: unread ? 'var(--accent-orange)' : 'var(--text-faint)' }}>
              {formatSidebarTime(c.last_message_at)}
            </span>
            {unread && (
              <span style={{
                marginLeft: 'auto', minWidth: 14, height: 14,
                padding: '0 4px', borderRadius: 7,
                background: 'var(--accent-orange)', color: '#fff',
                fontSize: 9, fontWeight: 800,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>{c.unread_count > 9 ? '9+' : c.unread_count}</span>
            )}
          </div>
          <p style={{
            fontSize: 12, margin: 0, lineHeight: 1.4,
            color: unread ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: unread ? 600 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{preview}</p>
        </div>
      </div>
    </Link>
  )
}

function Avatar({ url, name, group }: { url: string | null; name: string; group: boolean }) {
  const radius = group ? 6 : '50%'
  const initial = (name || '?').charAt(0).toUpperCase() || '?'
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxyImg(url)} alt=""
        style={{ width: 24, height: 24, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: 24, height: 24, borderRadius: radius, flexShrink: 0,
      background: 'linear-gradient(135deg, #2563eb, #f97316)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 800, color: '#fff',
      fontFamily: 'Outfit, sans-serif',
    }}>{initial}</div>
  )
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3].map(i => (
        <div key={i} style={{
          display: 'flex', gap: 9, padding: '9px 14px',
          borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <div className="hp-skel" style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="hp-skel" style={{ width: '40%', height: 9, borderRadius: 4 }} />
            <div className="hp-skel" style={{ width: '75%', height: 10, borderRadius: 4, marginTop: 4 }} />
          </div>
        </div>
      ))}
    </>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: '24px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>💬</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
        Pokalbių dar nėra
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        Pradėk privačią žinutę su kitu nariu arba sukurk grupę.
      </div>
    </div>
  )
}

function SignInCTA() {
  return (
    <div style={{ padding: '24px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>💬</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Privačios žinutės ir grupės
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        Prisijunk ir pradėk pokalbį su kitais nariais — DM'ai, grupės, real-time.
      </div>
    </div>
  )
}
