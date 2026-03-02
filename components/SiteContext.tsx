'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

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

export function SiteProvider({ children }: { children: ReactNode }) {
  const [lens, setLens] = useState<Lens>('lt')
  const [theme, setTheme] = useState<Theme>('dark')
  const dk = theme === 'dark'

  return (
    <SiteContext.Provider value={{ lens, setLens, theme, setTheme, dk }}>
      {children}
    </SiteContext.Provider>
  )
}
