'use client'
import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext.jsx'

/**
 * Puts public/sw.js in charge of this origin, and tells it when to fill.
 *
 * Production only, and the `else` branch is not tidiness — it is the fix for
 * the trap this kind of worker sets. A worker registered once keeps control of
 * the origin until something unregisters it, and `localhost` is the same
 * origin for a production build and a dev server. Without the tear-down, one
 * `next start` would leave a worker serving cached chunks over the top of
 * `next dev` for every session afterwards, and the symptom — edits that do not
 * appear, at random — reads like anything except a service worker.
 */
export default function ServiceWorkerRegistrar() {
  const { authenticated } = useAuth()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {})
      return
    }

    void navigator.serviceWorker.register('/sw.js')
      // Asked for explicitly rather than left to the browser, which only
      // rechecks the script on its own once the copy it holds is a day old. A
      // till is opened in the morning and left running, so without this a
      // deploy could take a day to reach one — and the worker is the thing
      // deciding what happens when the wifi drops. Cheap: an unchanged script
      // is a 304.
      .then((reg) => reg.update())
      .catch(() => {
        // A till that cannot register one still sells offline; it just loses
        // the app if it navigates. Nothing to say to the cashier about it.
      })
  }, [])

  /**
   * Warming waits for a session, because the screens worth saving are the
   * signed-in ones. Asked for without a cookie they redirect to /login, and a
   * till recovering from an outage onto a sign-in form would be worse than the
   * error page. The worker checks for the redirect too; this just avoids
   * provoking it.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    if (!authenticated) return
    void navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'warm' }))
      .catch(() => {})
  }, [authenticated])

  return null
}
