'use client'
import { useEffect, useState } from 'react'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'

/**
 * How the navigation sits on screen: down the left side, or along the top.
 *
 * A per-device choice, like light and dark — it lives in localStorage under
 * `pos-nav` and is applied as data-nav on <html>, which the inline script in
 * app/layout.jsx sets before first paint. Both navigations are always in the
 * page and CSS shows the chosen one (components/TopNav.jsx for the header).
 * Phones keep the menu button either way.
 */
const STORAGE_KEY = 'pos-nav'

const LAYOUTS = [
  {
    value: 'side',
    title: 'Sidebar',
    blurb: 'Links down the left. Best for a wide screen and a long list of sections.',
  },
  {
    value: 'top',
    title: 'Header',
    blurb: 'The same links in a website-style header along the top, with your account behind your initials.',
  },
]

export default function AppearanceSettingsPage() {
  const [layout, setLayout] = useState(null)

  useEffect(() => {
    setLayout(document.documentElement.dataset.nav === 'top' ? 'top' : 'side')
  }, [])

  function choose(value) {
    setLayout(value)
    if (value === 'top') document.documentElement.dataset.nav = 'top'
    else delete document.documentElement.dataset.nav
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      /* private window: the choice holds until the tab is closed */
    }
  }

  return (
    <SettingsSubpage
      title="Appearance"
      blurb="Where the navigation sits. Saved on this device, so each till and each person’s laptop can have its own."
    >
      <section className="card settings-card">
        <h3 className="sub">Navigation</h3>
        <div className="nav-choice" role="radiogroup" aria-label="Navigation layout">
          {LAYOUTS.map((l) => {
            const active = layout === l.value
            return (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={active}
                className={`nav-choice-option${active ? ' is-active' : ''}`}
                onClick={() => choose(l.value)}
                disabled={layout === null}
              >
                <span className={`nav-choice-preview nav-choice-preview--${l.value}`} aria-hidden="true">
                  <span className="ncp-bar">
                    <span className="ncp-dot" />
                    <span className="ncp-link ncp-link--on" />
                    <span className="ncp-link" />
                    <span className="ncp-link" />
                    <span className="ncp-link" />
                  </span>
                  <span className="ncp-body">
                    <span className="ncp-line ncp-line--title" />
                    <span className="ncp-line" />
                    <span className="ncp-line ncp-line--short" />
                    <span className="ncp-card" />
                  </span>
                </span>
                <span className="nav-choice-text">
                  <strong>
                    {l.title}
                    {active ? <span className="nav-choice-check" aria-hidden="true">✓</span> : null}
                  </strong>
                  <span className="muted small">{l.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>
        <p className="muted small nav-choice-note">
          On a phone the menu stays behind the ☰ button either way.
        </p>
      </section>
    </SettingsSubpage>
  )
}
