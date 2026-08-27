'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, setUnauthorizedHandler } from '@/api.js'
import { rememberSignedOutNotice } from '@/utils/signedOutNotice.js'

const AuthContext = createContext(null)

/**
 * How often a signed-in tab asks whether it is still signed in.
 *
 * The platform owner can stop a café — suspend it, pause it for a late
 * payment, let its trial run out — and every request that touches that café's
 * data then ends the session that made it. That is enough for anybody who is
 * working, but a till is idle most of the time: an order half taken and a
 * hand off the screen makes no requests at all, so without this the café
 * carries on looking open until somebody presses something.
 *
 * Fifteen seconds, matched to the server's cache of the same verdict, so the
 * two together answer the promise the console makes: stopping a café signs its
 * staff out within about half a minute, without being asked to. It is one
 * small query per tab per quarter-minute, and the tills are few.
 */
const HEARTBEAT_MS = 15_000

/**
 * Whether this tab is showing a café's menu to a customer rather than to
 * staff. The `?tenant=` on the address is what tells them apart: a customer
 * follows a link that names the café, and has no session to lose.
 */
function onPublicMenu() {
  if (typeof window === 'undefined') return false
  return (
    window.location.pathname === '/' &&
    new URLSearchParams(window.location.search).has('tenant')
  )
}

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // One check at a time. A screen that fires several requests at once gets
  // several 401s at once, and each of them would otherwise start its own.
  const inFlight = useRef(null)
  // Set once the browser is on its way to the login page, so nothing started
  // before that tries to render or navigate over the top of it.
  const leaving = useRef(false)

  /**
   * Ends the session in the browser and puts them on the login screen, with
   * the reason they were stopped if there was one.
   *
   * A full document load rather than a router push, for the reason sign-in and
   * sign-out both do one: the café's name, colours and logo are resolved on
   * the server in the root layout, and every client context — the open cart,
   * the menu — belongs to a café this browser is no longer in.
   */
  const signOutTo = useCallback((message) => {
    if (leaving.current || typeof window === 'undefined') return
    leaving.current = true
    rememberSignedOutNotice(message)
    window.location.assign('/login')
  }, [])

  /**
   * What to do with an answer from /api/auth/me.
   *
   * Shared by the first call of the page's life and every heartbeat after it,
   * so a café stopped while the tab was closed is treated exactly like one
   * stopped while somebody was standing at the till.
   *
   * A café that has been stopped is sent to the login screen and told why,
   * wherever they were. A session that has merely run out is only sent there
   * if they are on a screen that needs one — a customer reading `/?tenant=` is
   * reading a public menu, and yanking them off it because some staff member's
   * week-old cookie expired would be a worse bug than the one this is here to
   * fix.
   */
  const applySession = useCallback((r) => {
    const ok = Boolean(r?.authenticated)
    setAuthenticated(ok)
    setUser(ok && r?.user ? r.user : null)
    if (ok) return true

    if (r?.blockedMessage || r?.blocked) {
      signOutTo(r.blockedMessage || '')
    }
    return false
  }, [signOutTo])

  const refreshAuth = useCallback(async () => {
    try {
      applySession(await api.me())
    } catch {
      setAuthenticated(false)
      setUser(null)
    } finally {
      setAuthLoading(false)
    }
  }, [applySession])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  /**
   * Asks the server whether this session is still good, and acts on the answer.
   *
   * The one place that decides to sign somebody out mid-session, so the
   * heartbeat below and a 401 coming back from any other request both end the
   * same way. One at a time, and never after the browser has been sent to the
   * login page.
   */
  const verifySession = useCallback(async () => {
    if (leaving.current) return
    if (inFlight.current) return inFlight.current
    inFlight.current = (async () => {
      try {
        const r = await api.me()
        if (applySession(r)) return
        // Not blocked, merely no longer signed in — an expired cookie, or an
        // account that has been removed. Off a public screen that still needs
        // a session, they go to the login page with nothing to explain.
        //
        // `/` is exempt only when it is being read as a café's public menu,
        // which is the link that names one. The bare address signed out is the
        // login screen's job — middleware turns it away — so a session that
        // runs out while a tab sits there is sent along like anywhere else,
        // rather than dropping the till onto a menu board.
        if (!r?.blocked && !r?.blockedMessage && !onPublicMenu() && window.location.pathname !== '/login') {
          signOutTo('')
        }
      } catch {
        // The server could not be reached, which is not the same as being
        // signed out. Leave the screen as it is and ask again on the next beat
        // rather than throwing a working till onto the login page because a
        // till's wifi dropped for a second.
      } finally {
        inFlight.current = null
      }
    })()
    return inFlight.current
  }, [applySession, signOutTo])

  // Any 401 from anywhere in the app arrives here. It asks rather than assumes:
  // most 401s mean the session is gone, but not all of them do — the platform
  // owner with no café open gets one from any café endpoint, and signing them
  // out for it would be a rout.
  useEffect(() => {
    setUnauthorizedHandler(() => { void verifySession() })
  }, [verifySession])

  // The heartbeat, and the reason a stop reaches an idle till at all.
  //
  // Also on becoming visible: a browser throttles timers in a background tab,
  // and the moment somebody looks at the screen again is exactly when a stale
  // "still signed in" would be believed.
  useEffect(() => {
    if (!authenticated) return
    const timer = setInterval(() => { void verifySession() }, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void verifySession()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authenticated, verifySession])

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password)
    setAuthenticated(true)
    setUser(r.user ?? null)
    // Returned so the caller can route on who just signed in — a platform
    // owner has no till to be sent to.
    return r
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAuthenticated(false)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      authenticated,
      user,
      authLoading,
      login,
      logout,
      refreshAuth,
    }),
    [authenticated, user, authLoading, login, logout, refreshAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
