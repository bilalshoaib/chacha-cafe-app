'use client'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api.js'

/**
 * A standing reminder of whose account you are looking at.
 *
 * The fastest way to damage a customer's data is to forget you are inside it,
 * so this does not collapse, dismiss or fade — it sits above the header for
 * the whole session and says who, in what mode, and for how much longer.
 *
 * Read-only is stated plainly rather than implied, because "why can't I save?"
 * is otherwise a confusing few minutes, and the answer is a deliberate one.
 */
function minutesLeft(expiresAt) {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))
}

export default function ImpersonationBanner() {
  const [state, setState] = useState(null)
  const [, forceTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res = await api.impersonationStatus()
      setState(res.impersonating ? res : null)
    } catch {
      setState(null)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // Re-render each minute so the remaining time is honest, and drop the banner
  // the moment the session lapses rather than leaving a stale one on screen.
  useEffect(() => {
    if (!state) return undefined
    const id = setInterval(() => {
      if (Date.now() > state.expiresAt) void refresh()
      else forceTick((n) => n + 1)
    }, 30000)
    return () => clearInterval(id)
  }, [state, refresh])

  if (!state) return null

  async function exit() {
    await api.stopImpersonating('current')
    setState(null)
    // Full load rather than push + refresh: closing a support session changes
    // which café the server-rendered layout is wearing, and a client-side
    // navigation would leave the customer's name and colours on the platform's
    // own screens.
    window.location.assign('/platform')
  }

  return (
    <div className={`impersonation-banner${state.control ? ' impersonation-control' : ''}`} role="status">
      <span className="impersonation-text">
        Viewing <strong>{state.tenantName}</strong>
        {state.control
          ? <span className="impersonation-mode"> — you can make changes</span>
          : <span className="impersonation-mode"> — read only</span>}
      </span>
      <span className="impersonation-time">{minutesLeft(state.expiresAt)} min left</span>
      <button type="button" className="impersonation-exit" onClick={() => void exit()}>
        Exit
      </button>
    </div>
  )
}
