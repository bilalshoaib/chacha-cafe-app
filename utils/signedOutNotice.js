/**
 * Why somebody was signed out, carried across the reload to the login page.
 *
 * Being stopped mid-shift is the one sign-out that needs explaining. The
 * server knows the reason at the moment it ends the session — "Access is
 * paused: invoice #41 is 21 days overdue" — but the next thing the browser
 * does is a full document load onto /login, and nothing survives that.
 *
 * sessionStorage rather than a query string. A message in the address bar can
 * be edited and forwarded, so a café could be shown any words a stranger
 * chose; this can only have been written by our own code, in this tab, and is
 * read once and dropped. Storage that is unavailable — a locked-down browser,
 * private mode — costs nothing here: the login route repeats the reason the
 * moment they try to sign back in.
 */
const KEY = 'cafe.signedOutNotice'

export function rememberSignedOutNotice(message) {
  if (typeof window === 'undefined' || !message) return
  try {
    window.sessionStorage.setItem(KEY, message)
  } catch {
    // Then they read it on the next sign-in attempt instead.
  }
}

/** Reads the notice and clears it, so a later reload is not still shouting. */
export function takeSignedOutNotice() {
  if (typeof window === 'undefined') return ''
  try {
    const message = window.sessionStorage.getItem(KEY)
    if (message) window.sessionStorage.removeItem(KEY)
    return message || ''
  } catch {
    return ''
  }
}
