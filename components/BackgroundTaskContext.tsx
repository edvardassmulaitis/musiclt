'use client'

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'

export type TaskStatus = 'running' | 'done' | 'error'

export type BackgroundTask = {
  id: string
  label: string
  status: TaskStatus
  detail?: string
  startedAt: number
}

type TaskContextType = {
  tasks: BackgroundTask[]
  startTask: (id: string, label: string) => void
  updateTask: (id: string, detail: string) => void
  finishTask: (id: string, detail?: string) => void
  errorTask: (id: string, detail: string) => void
}

const TaskContext = createContext<TaskContextType | null>(null)

export function BackgroundTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([])
  // Auto-clear 'done'/'error' tasks after 5s
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const startTask = useCallback((id: string, label: string) => {
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
    setTasks(p => {
      const exists = p.find(t => t.id === id)
      if (exists) return p.map(t => t.id === id ? { ...t, label, status: 'running', detail: undefined, startedAt: Date.now() } : t)
      return [...p, { id, label, status: 'running', startedAt: Date.now() }]
    })
  }, [])

  const updateTask = useCallback((id: string, detail: string) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, detail } : t))
  }, [])

  const finishTask = useCallback((id: string, detail?: string) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, status: 'done', detail } : t))
    timers.current[id] = setTimeout(() => {
      setTasks(p => p.filter(t => t.id !== id))
      delete timers.current[id]
    }, 5000)
  }, [])

  const errorTask = useCallback((id: string, detail: string) => {
    setTasks(p => p.map(t => t.id === id ? { ...t, status: 'error', detail } : t))
    timers.current[id] = setTimeout(() => {
      setTasks(p => p.filter(t => t.id !== id))
      delete timers.current[id]
    }, 8000)
  }, [])

  return (
    <TaskContext.Provider value={{ tasks, startTask, updateTask, finishTask, errorTask }}>
      {children}
    </TaskContext.Provider>
  )
}

export function useBackgroundTasks() {
  const ctx = useContext(TaskContext)
  if (!ctx) throw new Error('useBackgroundTasks must be used within BackgroundTaskProvider')
  return ctx
}
