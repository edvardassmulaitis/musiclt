'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Lens = 'lt' | 'world' | 'all'
type Theme = 'dark' | 'light'

type SiteContextType = {
  lens: Lens
  setLens: (l: Lens) => void
  theme: Theme
  setTheme: (t: Theme) => void
  dk: boolean
}

const SiteContext = createContext<SiteContextType>({
  lens: 'lt', setLens: () => {},
  theme: 'dark', setTheme: () => {},
  dk: true,
})

export function useSite() { return useContext(SiteContext) }

/* ── Cookie helpers ── */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days = 400) {
  if (typeof document === 'undefined') return
  const d = new Date()
  d.setTime(d.getTime() + days * 86400000)
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`
}

/* ── Read initial theme (runs once on mount) ── */
function getInitialTheme(): Theme {
  // 1. Check cookie
  if (typeof document !== 'undefined') {
    const saved = getCookie('music-lt-theme')
    if (saved === 'light' || saved === 'dark') return saved
  }
  // 2. Check system preference
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  // 3. Default dark
  return 'dark'
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const [lens, setLens] = useState<Lens>('lt')
  const [theme, setThemeState] = useState<Theme>('dark') // SSR default
  const [mounted, setMounted] = useState(false)
  const dk = theme === 'dark'

  // Hydrate theme from cookie/system on mount
  useEffect(() => {
    setThemeState(getInitialTheme())
    setMounted(true)
  }, [])

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.style.colorScheme = theme
    // Update meta theme-color for mobile browsers
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = dk ? '#080d14' : '#f0f4fa'
  }, [theme, dk, mounted])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    setCookie('music-lt-theme', t)
  }, [])

  return (
    <SiteContext.Provider value={{ lens, setLens, theme, setTheme, dk }}>
      {children}
    </SiteContext.Provider>
  )
}
