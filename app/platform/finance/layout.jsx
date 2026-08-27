'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlatformBooksProvider, usePlatformBooks } from '@/context/PlatformBooksContext.jsx'

/**
 * The platform's own books.
 *
 * Every other financial screen in this product belongs to a café and is fenced
 * off from the others. This one is the business underneath them: what the
 * cafés pay, what running the thing costs, and what is left.
 */
const TABS = [
  { seg: '',         label: 'Report' },
  { seg: 'expenses', label: 'Expenses' },
  { seg: 'payments', label: 'Payments' },
  { seg: 'pricing',  label: 'Pricing' },
]

const RANGES = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-year',  label: 'This year' },
  { key: 'all',        label: 'All time' },
]

function BooksChrome({ children }) {
  const pathname = usePathname()
  const { rangeKey, chooseRange, error } = usePlatformBooks()
  const base = '/platform/finance'

  return (
    <main className="platform-page">
      <div className="platform-head">
        <div>
          <h1>Books</h1>
          <p>
            What the cafés pay for the product, what it costs to run, and what is left. Not a
            café’s figures — none of this is visible to any of them.
          </p>
        </div>
        {/* The range steers all four tabs, so it lives above them rather than
            on the one that happens to be open. */}
        <div className="window-picker" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={rangeKey === r.key}
              onClick={() => chooseRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <nav className="tenant-tabs" aria-label="Books sections">
        {TABS.map(({ seg, label }) => {
          const href = seg ? `${base}/${seg}` : base
          const active = seg ? pathname === href : pathname === base
          return (
            <Link key={label} href={href} className="tenant-tab" aria-current={active ? 'page' : undefined}>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="tenant-tab-body">{children}</div>
    </main>
  )
}

export default function PlatformBooksLayout({ children }) {
  return (
    <PlatformBooksProvider>
      <BooksChrome>{children}</BooksChrome>
    </PlatformBooksProvider>
  )
}
