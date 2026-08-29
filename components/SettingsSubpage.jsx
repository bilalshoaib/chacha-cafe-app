'use client'
import Link from 'next/link'

/**
 * The frame every settings subpage sits in: a title, a line saying what the
 * page is for, and the way back to the hub.
 *
 * Shared rather than repeated so the four pages cannot drift apart in where
 * the back link is — which matters more here than usual, because these pages
 * are reached one at a time and the link is the only way out of them that is
 * not the browser's own.
 */
export default function SettingsSubpage({ title, blurb, children, actions = null }) {
  return (
    <main className="settings-page settings-subpage">
      <div className="settings-subpage-head">
        <div>
          <h2>{title}</h2>
          {blurb ? <p className="muted small">{blurb}</p> : null}
        </div>
        <div className="settings-subpage-actions">
          <Link href="/settings" className="ghost sm">← Settings</Link>
          {actions}
        </div>
      </div>
      {children}
    </main>
  )
}
