'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/api.js'
import { STARTER_MENUS } from '@/constants/starterMenus.js'

/**
 * Creating a café.
 *
 * The only question here that cannot be changed later without consequence is
 * how many counters the business runs, and it is asked outright rather than
 * assumed — most cafés have one menu, and one that does must never be shown a
 * counter picker on every menu item and expense.
 *
 * Everything else is a starting point the owner edits from their own settings:
 * name, colours, categories, branches, staff. This screen does not set
 * branding at all, because a console that configures each customer is a
 * console that has to be used for every customer.
 */
export default function NewTenantPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [plan, setPlan] = useState('trial')
  const [separateCounters, setSeparateCounters] = useState(false)
  const [counterNames, setCounterNames] = useState(['', ''])
  const [starter, setStarter] = useState('cafe')
  const [currency, setCurrency] = useState('PKR')
  const [timezone, setTimezone] = useState('Asia/Karachi')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const autoSlug = slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      const res = await api.createTenant({
        name, slug: autoSlug, ownerEmail, ownerName, plan,
        brandNames: separateCounters ? counterNames.filter((c) => c.trim()) : [],
        starterMenu: starter, currency, timezone,
      })
      setCreated(res)
    } catch (err) {
      setError(err.message || 'Could not create the café.')
    } finally {
      setSaving(false)
    }
  }

  // Shown once. The password is not stored in a readable form, so this screen
  // is the only chance to write it down.
  if (created) {
    return (
      <main className="platform-page">
        <div className="card">
          <h1>{created.tenant.name} is ready</h1>
          <p className="muted">Hand these details to the owner. The password is shown here and nowhere else — if it is lost, reset it rather than look it up.</p>
          <dl className="handover">
            <dt>Sign in with</dt><dd><code>{created.owner.email}</code></dd>
            <dt>Temporary password</dt><dd><code className="handover-password">{created.owner.temporaryPassword}</code></dd>
          </dl>
          <p className="muted small">They should change it from Settings after signing in.</p>
          <div className="row gap">
            <Link href={`/platform/tenants/${created.tenant.id}`} className="primary btn-link">Open café</Link>
            <button type="button" className="ghost" onClick={() => router.push('/platform')}>Back to all cafés</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="platform-page">
      <div className="page-hero">
        <div className="page-hero-body">
          <div className="page-hero-icon">🏢</div>
          <div>
            <h1>New café</h1>
            <p className="muted small">Sets up the business, its first branch, its menu categories and the owner’s account.</p>
          </div>
        </div>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <form className="card form-grid" onSubmit={submit}>
        <label className="field">
          <span>Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Gloria’s Coffee" />
        </label>

        <label className="field">
          <span>URL name</span>
          <input value={autoSlug} onChange={(e) => setSlug(e.target.value)} placeholder="gloriascoffee" />
          <span className="muted small">Used in their web address. Letters and numbers only.</span>
        </label>

        <label className="field">
          <span>Owner email</span>
          <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="owner@gloriascoffee.pk" />
          <span className="muted small">Their sign-in. We create the account and give you a temporary password to pass on.</span>
        </label>

        <label className="field">
          <span>Owner name <span className="muted">(optional)</span></span>
          <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Gloria" />
        </label>

        <fieldset className="field">
          <legend>Counters</legend>
          <label className="radio-row">
            <input type="radio" name="counters" checked={!separateCounters} onChange={() => setSeparateCounters(false)} />
            <span>
              <strong>One menu</strong>
              <span className="muted small block">The usual case. Nothing in the app mentions counters.</span>
            </span>
          </label>
          <label className="radio-row">
            <input type="radio" name="counters" checked={separateCounters} onChange={() => setSeparateCounters(true)} />
            <span>
              <strong>Separate counters</strong>
              <span className="muted small block">Two menus under one roof, reported separately — like a café and a burger bar side by side.</span>
            </span>
          </label>
          {separateCounters ? (
            <div className="counter-names">
              {counterNames.map((c, i) => (
                <input
                  key={i}
                  value={c}
                  placeholder={`Counter ${i + 1} name`}
                  onChange={(e) => setCounterNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                />
              ))}
              <button type="button" className="ghost sm" onClick={() => setCounterNames((p) => [...p, ''])}>
                Add another counter
              </button>
            </div>
          ) : null}
        </fieldset>

        <label className="field">
          <span>Menu style</span>
          <select value={starter} onChange={(e) => setStarter(e.target.value)}>
            {STARTER_MENUS.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.description}</option>)}
          </select>
          <span className="muted small">Starting categories. They can rename, reorder and delete them.</span>
        </label>

        <div className="row gap">
          <label className="field">
            <span>Currency</span>
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Plan</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="trial">Trial</option>
            <option value="standard">Standard</option>
            <option value="multi-branch">Multi-branch</option>
          </select>
        </label>

        <div className="row gap">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create café'}
          </button>
          <Link href="/platform" className="ghost btn-link">Cancel</Link>
        </div>
      </form>
    </main>
  )
}
