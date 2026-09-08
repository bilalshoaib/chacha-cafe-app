/**
 * Who was signed in here last, so a till that boots without a network does not
 * decide it has been signed out.
 *
 * AuthProvider starts every page by asking /api/auth/me. With no connection
 * that call fails, and failing used to mean the same thing as being told no —
 * so a disconnected till that reloaded, or navigated, came back as a signed-out
 * browser: no café, no menu, no queue, no banner. The sale rung up a minute
 * earlier was still safely in IndexedDB and there was no longer any screen
 * that would show it.
 *
 * The heartbeat already draws this distinction, and leaves a working till
 * alone when the server cannot be reached. This is the same judgement applied
 * to the first call of the page's life, which is the only one that did not
 * have it.
 *
 * **This grants nothing.** It decides which chrome to draw, and no more. Every
 * request still carries the session cookie and the server still decides what
 * it is worth; a remembered user with a dead cookie sees the screens fail one
 * by one and the next heartbeat to reach the server signs them out properly.
 * What it cannot do is put a café's data on screen, because the data is not
 * here — only what this device cached while it was genuinely signed in.
 */

const KEY = 'cafe.lastSession'

/**
 * A till left in a drawer over a holiday should sign in again rather than wake
 * up wearing a session from last month. Long enough to cover a closed weekend,
 * short enough that a device which has changed hands does not.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function rememberSession(user) {
  if (typeof window === 'undefined' || !user) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), user }))
  } catch {
    // Private mode, or storage that is full. The till then behaves exactly as
    // it did before this existed, which is survivable — it is only the offline
    // reboot that gets worse.
  }
}

/** The last signed-in user, or null if there is none or it is too old to trust. */
export function readRememberedSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.user || !Number.isFinite(parsed.at)) return null
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed.user
  } catch {
    return null
  }
}

export function forgetSession() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // Nothing to do about it, and nothing is exposed by the attempt failing.
  }
}
