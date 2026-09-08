'use client'
import { useEffect, useState } from 'react'

/**
 * Light / dark surface switch, kept in the sidebar footer.
 *
 * The choice is a per-device convenience, not a café setting — it lives in
 * localStorage and is applied as data-theme on <html>. The matching inline
 * script in app/layout.jsx sets the attribute before first paint so there is
 * no flash of the wrong theme; this component only renders the control and
 * writes the choice back.
 *
 * Renders nothing until mounted: the server has no localStorage and would
 * otherwise disagree with the client on which glyph to show.
 */
const STORAGE_KEY = 'pos-theme'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    setMounted(true)
    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY)
      } catch {
        return null
      }
    })()
    setTheme(stored === 'dark' ? 'dark' : 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private window: the choice just won't persist */
    }
    document.documentElement.dataset.theme = next
  }

  if (!mounted) return null

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      className="side-nav-theme"
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? 'Switch to light' : 'Switch to dark'}
    >
      <span aria-hidden="true">{dark ? '☀' : '☾'}</span>
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
