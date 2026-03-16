'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import AdminSearchModal from './admin-search-modal'
import { useBackgroundTasks, type BackgroundTask } from './BackgroundTaskContext'

// ── Progress bar po header'iu ─────────────────────────────────────────────────

function ProgressBar({ tasks }: { tasks: BackgroundTask[] }) {
  const running = tasks.filter(t => t.status === 'running')
  const done = tasks.filter(t => t.status === 'done')
  const errors = tasks.filter(t => t.status === 'error')

  if (!running.length && !done.length && !errors.length) return null

  const color = errors.length ? 'bg-red-500' : running.length ? 'bg-violet-500' : 'bg-emerald-500'
  const isRunning = running.length > 0

  // Parse progress iš detail string (pvz "Made in Heaven: 6/10" → 60%)
  let percent = -1
  if (isRunning) {
    const detail = running[0]?.detail || ''
    const m = detail.match(/(\d+)\/(\d+)/)
    if (m) percent = Math.round((parseInt(m[1]) / parseInt(m[2])) * 100)
  }

  return (
    <div className="h-[3px] w-full bg-gray-100/50 overflow-hidden">
      {isRunning ? (
        percent >= 0 ? (
          <div className={`h-full ${color} transition-all duration-700 ease-out rounded-r-full`} style={{ width: `${percent}%` }} />
        ) : (
          <div className={`h-full w-1/3 ${color} rounded-full`} style={{ animation: 'progress-slide 1.5s ease-in-out infinite' }} />
        )
      ) : (
        <div className={`h-full ${color} w-full`} style={{ animation: 'progress-fade 1s ease-out forwards' }} />
      )}
      <style>{`
        @keyframes progress-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes progress-fade { 0% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
    </div>
  )
}

// ── Task indicator header'yje ─────────────────────────────────────────────────

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

  if (!tasks.length && discographyMinimized) {
    return (
      <button
        onClick={() => { window.dispatchEvent(new CustomEvent('discography-reopen')); setDiscographyMinimized(false) }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors text-xs text-violet-600 font-medium shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
        Diskografija
      </button>
    )
  }

  const running = tasks.filter(t => t.status === 'running')
  const errors = tasks.filter(t => t.status === 'error')
  const latest = running[0] || tasks[tasks.length - 1]

  // Extract short label (remove "Importuojama: " prefix)
  const shortLabel = latest.label.replace(/^Importuojam[ao]: /, '').replace(/^Singlai: /, '🎤 ')

  // Extract N/M from detail
  const progressMatch = latest.detail?.match(/(\d+)\/(\d+)/)
  const progressText = progressMatch ? `${progressMatch[1]}/${progressMatch[2]}` : ''

  return (
    <div ref={ref} className="relative flex items-center shrink-0">
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all text-xs max-w-[200px] sm:max-w-[280px] ${
          running.length ? 'bg-violet-50 text-violet-700 hover:bg-violet-100'
          : errors.length ? 'bg-red-50 text-red-600 hover:bg-red-100'
          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
        }`}
      >
        {running.length ? (
          <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
            <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : errors.length ? (
          <span className="shrink-0">✗</span>
        ) : (
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
        <span className="truncate font-medium">{shortLabel}</span>
        {progressText && (
          <span className="text-[10px] font-mono opacity-60 shrink-0">{progressText}</span>
        )}
        {tasks.length > 1 && (
          <span className="bg-white/50 rounded px-1 text-[10px] font-bold shrink-0">{tasks.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3.5 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Procesai</span>
            {discographyMinimized && (
              <button
                onClick={() => { window.dispatchEvent(new CustomEvent('discography-reopen')); setDiscographyMinimized(false); setOpen(false) }}
                className="text-[11px] text-violet-600 font-medium hover:underline">
                ↑ Atidaryti langą
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {tasks.map(task => {
              const taskProgress = task.detail?.match(/(\d+)\/(\d+)/)
              const taskPercent = taskProgress ? Math.round((parseInt(taskProgress[1]) / parseInt(taskProgress[2])) * 100) : -1

              return (
                <div key={task.id} className="px-3.5 py-3 flex items-center gap-3">
                  <div className="shrink-0">
                    {task.status === 'running' ? (
                      <div className="w-6 h-6 rounded-full border-2 border-violet-200 border-t-violet-500 animate-spin" />
                    ) : task.status === 'error' ? (
                      <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-500 text-xs font-bold">!</div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{task.label}</p>
                    {task.detail && (
                      <p className={`text-xs truncate mt-0.5 ${task.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                        {task.detail}
                      </p>
                    )}
                    {/* Mini progress bar dropdown'e */}
                    {task.status === 'running' && taskPercent >= 0 && (
                      <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-400 rounded-full transition-all duration-500" style={{ width: `${taskPercent}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin Header ──────────────────────────────────────────────────────────────

export default function AdminHeader() {
  const { data: session } = useSession()
  const { tasks } = useBackgroundTasks()
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
        {/* Progress bar — plonas animuotas bar po header'iu */}
        <ProgressBar tasks={tasks} />
      </header>
      {searchOpen && <AdminSearchModal onClose={() => setSearchOpen(false)} />}
    </>
  )
}
