'use client'

import Image from 'next/image'

// Atomic avatar — gradient placeholder jei nėra paveiksliuko, square
// rounded-full skeleton'as. Naudojam pokalbių sąraše, žinutėse, modaluose.

type Props = {
  url: string | null | undefined
  fallbackName: string | null | undefined
  size?: number
  square?: boolean // grupių avatar'ams (rounded-2xl, ne 50%)
}

export function ChatAvatar({ url, fallbackName, size = 36, square }: Props) {
  const radius = square ? 8 : '50%'
  const initial = (fallbackName || '?').trim().charAt(0).toUpperCase() || '?'

  if (url) {
    return (
      <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
        <Image
          src={url}
          alt=""
          width={size}
          height={size}
          unoptimized
          style={{ borderRadius: radius, objectFit: 'cover', width: size, height: size }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        background: 'linear-gradient(135deg, #2563eb, #f97316)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.42),
        lineHeight: 1,
      }}
    >
      {initial}
    </div>
  )
}

// Group avatar = stack of two avatars (užkulisinis efektas).
type GroupProps = {
  participants: Array<{ avatar_url: string | null; full_name: string | null; username: string | null }>
  size?: number
}

export function ChatGroupAvatar({ participants, size = 36 }: GroupProps) {
  const list = participants.slice(0, 2)
  if (list.length === 0) {
    return <ChatAvatar url={null} fallbackName="#" size={size} />
  }
  if (list.length === 1) {
    return <ChatAvatar url={list[0].avatar_url} fallbackName={list[0].full_name || list[0].username} size={size} />
  }
  const small = Math.round(size * 0.65)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0 }}>
        <ChatAvatar url={list[0].avatar_url} fallbackName={list[0].full_name || list[0].username} size={small} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, right: 0, border: '2px solid var(--bg-surface)', borderRadius: '50%' }}>
        <ChatAvatar url={list[1].avatar_url} fallbackName={list[1].full_name || list[1].username} size={small} />
      </div>
    </div>
  )
}
