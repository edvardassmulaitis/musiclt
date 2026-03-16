'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import AdminSearchModal from './admin-search-modal'
import { useBackgroundTasks } from './BackgroundTaskContext'

function TaskIndicator() {
  const { tasks } = useBackgroundTasks()
  const [open, setOpen] = useState(false)
  const [discographyMinimized, setDiscographyMinimized] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setDiscographyMinimized(detail?.open ?? false)
    }
    window.addEventListener('discography-minimized', handler)
    return () => window.removeEventListener('discography-minimized', handler)
  }, [])

  if (!tasks.length && !discographyMinimized) return null

  // Jei nėra tasks bet modalas minimizuotas — rodyti tik reopen mygtuką
  if (!tasks.length && discographyMinimized) {
    return (
      <button
        onClick={() => { window.dispatchEvent(new CustomEvent('discography-reopen')); setDiscographyMinimized(false) }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors text-xs text-violet-600 font-medium shrink-0"
        title="Atidaryti diskografijos langą"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
        Diskografija
      </button>
    )
  }

  const running = tasks.filter(t => t.status === 'running')
  const errors = tasks.filter(t => t.status === 'error')
  const latest = running[0] || tasks[tasks.length - 1]

  return (
    <div ref={ref} className="relative flex items-center shrink-0">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors text-xs text-gray-500 max-w-[160px] sm:max-w-[220px]"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${
          errors.length ? 'bg-red-500'
          : running.length ? 'bg-blue-500 animate-pulse'
          : 'bg-green-500'
        }`} />
        <span className="truncate text-gray-600">
          {latest.label}
          {latest.detail && <span className="text-gray-400"> · {latest.detail}</span>}
        </span>
        {tasks.length > 1 && (
          <span className="bg-gray-200 text-gray-600 rounded px-1 text-[10px] font-bold shrink-0">{tasks.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Foniniai procesai
          </div>
          {discographyMinimized && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('discography-reopen'))}
              className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 hover:bg-violet-50 transition-colors text-left">
              <svg className="w-3.5 h-3.5 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
              <span className="text-sm text-violet-600 font-medium">Atidaryti diskografijos langą</span>
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {tasks.map(task => (
              <div key={task.id} className="px-3 py-2.5 flex items-start gap-2.5 border-b border-gray-50 last:border-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  task.status === 'running' ? 'bg-blue-500 animate-pulse'
                  : task.status === 'error' ? 'bg-red-500'
                  : 'bg-green-500'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{task.label}</p>
                  {task.detail && (
                    <p className={`text-xs truncate mt-0.5 ${
                      task.status === 'error' ? 'text-red-500' : 'text-gray-400'
                    }`}>{task.detail}</p>
                  )}
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {task.status === 'running' ? 'Vykdoma...'
                    : task.status === 'done' ? '✓ Baigta'
                    : '✗ Klaida'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminHeader() {
  const { data: session } = useSession()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin'
  if (!isAdmin) return null

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="w-full px-3 sm:px-6 py-2 flex items-center gap-2 sm:gap-4">
          <Link href="/admin" className="font-black text-gray-900 text-base shrink-0 flex items-center gap-1">
            🎵 <span className="hidden sm:inline">music.lt</span>
          </Link>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-400 transition-colors text-left min-w-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-none stroke-current stroke-2 text-gray-400">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span className="flex-1 truncate">Ieškoti...</span>
            <kbd className="text-xs bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-400 hidden sm:inline shrink-0">⌘K</kbd>
          </button>

          <TaskIndicator />

          <nav className="flex items-center gap-1 shrink-0">
            <Link href="/admin/users"
              className="w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 flex items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors gap-1.5">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 shrink-0">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span className="hidden sm:inline">Vartotojai</span>
            </Link>
            <Link href="/admin/settings"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </Link>
          </nav>
        </div>
      </header>
      {searchOpen && <AdminSearchModal onClose={() => setSearchOpen(false)} />}
    </>
  )
}
