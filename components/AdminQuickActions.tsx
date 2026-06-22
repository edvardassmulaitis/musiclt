'use client'

/**
 * AdminQuickActions — admin-only greitieji veiksmai header'iuose:
 *   • „+ Atlikėjas" → /admin/artists/new
 *   • „⚡ Greitas pridėjimas" → atidaro AdminQuickAddModal (daina/albumas per nuorodą)
 *
 * variant="public" — public SiteHeader desktop juosta (sh-desktop-action klasė
 *   slepia mobile'e; ghost stilius derinasi prie temos).
 * variant="admin"  — admin AdminHeader nav (šviesi tema, gray pill'ai).
 */

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { openAdminQuickAdd } from '@/components/AdminQuickAddModal'

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
)

const CodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
)

export function AdminQuickActions({ variant = 'public' }: { variant?: 'public' | 'admin' }) {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!isAdmin) return null

  if (variant === 'admin') {
    const cls =
      'flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-lg text-sm font-medium transition-colors shrink-0'
    return (
      <>
        <Link
          href="/admin/artists/new"
          className={`${cls} text-gray-600 hover:bg-gray-100`}
        >
          <PlusIcon />
          <span className="hidden sm:inline">Atlikėjas</span>
        </Link>
        <Link
          href="/admin/artist-import"
          className={`${cls} text-gray-600 hover:bg-gray-100`}
          title="JSON importas"
        >
          <CodeIcon />
          <span className="hidden sm:inline">JSON</span>
        </Link>
        <button
          type="button"
          onClick={() => openAdminQuickAdd()}
          className={`${cls} bg-violet-50 text-violet-700 hover:bg-violet-100`}
        >
          <span>⚡</span>
          <span className="hidden sm:inline">Greitas pridėjimas</span>
        </button>
      </>
    )
  }

  // variant === 'public'
  const ghost: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px',
    border: '1px solid var(--border-default)', borderRadius: 18, background: 'transparent',
    color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none',
    transition: 'color .15s, background .15s, border-color .15s',
  }
  const onEnter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--text-primary)'
    e.currentTarget.style.background = 'var(--bg-hover)'
    e.currentTarget.style.borderColor = 'var(--border-strong)'
  }
  const onLeave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color = 'var(--text-secondary)'
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.borderColor = 'var(--border-default)'
  }

  return (
    <>
      <Link
        href="/admin/artists/new"
        className="sh-desktop-action"
        style={ghost}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-label="Naujas atlikėjas"
      >
        <PlusIcon />
        <span>Atlikėjas</span>
      </Link>
      <button
        type="button"
        onClick={() => openAdminQuickAdd()}
        className="sh-desktop-action"
        style={ghost}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-label="Greitas pridėjimas"
      >
        <span>⚡</span>
        <span>Greitas</span>
      </button>
    </>
  )
}
