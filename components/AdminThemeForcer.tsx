'use client'

import { useEffect } from 'react'

/**
 * Forces light theme on <html> while admin pages are active.
 * Restores the user's original theme on unmount (when leaving admin).
 */
export default function AdminThemeForcer() {
  useEffect(() => {
    const root = document.documentElement
    const prevTheme = root.getAttribute('data-theme') || 'dark'
    const prevColorScheme = root.style.colorScheme

    root.setAttribute('data-theme', 'light')
    root.style.colorScheme = 'light'

    return () => {
      root.setAttribute('data-theme', prevTheme)
      root.style.colorScheme = prevColorScheme
    }
  }, [])

  return null
}
