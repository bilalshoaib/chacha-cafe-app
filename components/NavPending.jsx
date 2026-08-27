'use client'
import Link, { useLinkStatus } from 'next/link'

/**
 * The mark a tab wears between being pressed and the screen it names arriving.
 *
 * Every screen in this app renders dynamically — the root layout resolves the
 * café from the session cookie — so no tab prefetches, and pressing one waits
 * on a round trip to the server. Nothing on screen changed while it waited, so
 * a press read as a dead button: people pressed again, and again, and the
 * presses queued up behind each other until one of them appeared to work. This
 * is the missing acknowledgement.
 *
 * Rendered as a child of the Link rather than around it, because
 * useLinkStatus() reports on the Link above it — anywhere higher and it would
 * answer for the wrong tab, or for none. It draws nothing itself; `.nav-pending`
 * in 03-components.css is the bar, and is positioned out of the flow so that
 * showing it cannot move the tabs under somebody's pointer.
 */
export default function NavPending() {
  const { pending } = useLinkStatus()
  return pending ? <span className="nav-pending" aria-hidden="true" /> : null
}

/**
 * A link that says it has been pressed.
 *
 * The same acknowledgement the tabs give, for the links that are not tabs: a
 * café's name in the console list, the buttons that open a screen. These are
 * the presses that felt worst, because a filled button that does nothing for
 * a second reads as broken in a way a line of text does not.
 *
 * Takes the place of `next/link` at the call site and behaves the same;
 * everything it is given is passed straight through.
 */
export function PendingLink({ children, ...props }) {
  return (
    <Link {...props}>
      {children}
      <NavPending />
    </Link>
  )
}
