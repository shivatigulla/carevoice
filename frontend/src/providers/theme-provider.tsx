import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ThemeContext, type ResolvedTheme, type Theme } from '@/providers/theme-context'


const STORAGE_KEY = 'carevoice-theme' // also read by the inline script in index.html



const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readStored(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const mq = media()
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0B1413' : '#F7F8F6')
  }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* private mode */
    }
  }, [])

  const toggleTheme = useCallback(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'), [resolvedTheme, setTheme])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme, toggleTheme }), [theme, resolvedTheme, setTheme, toggleTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
