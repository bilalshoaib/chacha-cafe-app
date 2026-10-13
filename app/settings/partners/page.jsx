'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/api.js'
import RequireSuperAdmin from '@/components/RequireSuperAdmin.jsx'
import SettingsSubpage from '@/components/SettingsSubpage.jsx'
import { useOrders } from '@/context/OrdersContext.jsx'

/**
 * Partner kitchens (lib/partners.js): another business selling from this
 * café's menu, through this café's till, at prices of its own.
 *
 * Here the owner adds one, sets the discount the café gives it off the menu
 * price, and gives it logins. Which items it sells and for how much are on the
 * partner's own price list, which the partner can edit itself.
 */
export default function PartnerSettingsPage() {
  return (
    <RequireSuperAdmin>
      <SettingsSubpage
        title="Partner kitchens"
        blurb="Another business selling from your menu at its own prices. Your cashier rings up its sales on a till of its own; the reports show what you keep and what you owe it."
      >
        <PartnerSettings />
      </SettingsSubpage>
    </RequireSuperAdmin>
  )
}

function PartnerSettings() {
  const { refreshAll } = useOrders()
  const [partners, setPartners] = useState(null)
  const [tenantSlug, setTenantSlug] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [pct, setPct] = useState('20')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const { partners: list, tenantSlug: slug } = await api.listPartners()
      setPartners(list)
      setTenantSlug(slug)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function create(e) {
    e.preventDefault()
    setError('')
    setCreating(true)
    try {
      await api.createPartner({ name, supplyDiscountPct: pct })
      setName('')
      await load()
      // The sidebar's till links come from the menu, which carries partners.
      void refreshAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      {error ? <p className="banner error" role="alert">{error}</p> : null}

      {partners === null ? <p className="muted">Loading…</p> : partners.map((p) => (
        <PartnerCard key={p.id} partner={p} tenantSlug={tenantSlug} onChanged={async () => { await load(); void refreshAll() }} />
      ))}

      <section className="card settings-card">
        <h3 className="sub">Add a partner kitchen</h3>
        <form className="partner-form" onSubmit={create}>
          <label className="field partner-field-name">
            <span>Partner name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Claude Kitchen" maxLength={80} required />
          </label>
          <label className="field partner-field-pct">
            <span>Discount off menu price</span>
            <span className="partner-pct">
              <input type="number" min={0} max={100} step="0.01" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} required />
              <span aria-hidden="true">%</span>
            </span>
          </label>
          <button type="submit" className="primary" disabled={creating || !name.trim()}>
            {creating ? 'Adding…' : 'Add partner'}
          </button>
        </form>
        <p className="muted small partner-hint">
          With a 20% discount, the partner owes you 80% of your menu price for every item it sells, whatever price it sells it at.
        </p>
      </section>
    </>
  )
}

function PartnerCard({ partner, tenantSlug, onChanged }) {
  const [name, setName] = useState(partner.name)
  const [pct, setPct] = useState(String(partner.supplyDiscountPct))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [logins, setLogins] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false)

  const loadLogins = useCallback(async () => {
    try {
      const { logins: list } = await api.listPartnerLogins(partner.id)
      setLogins(list)
    } catch (e) {
      setError(e.message)
    }
  }, [partner.id])

  useEffect(() => { void loadLogins() }, [loadLogins])

  const changed = name.trim() !== partner.name || Number(pct) !== partner.supplyDiscountPct

  async function save() {
    setError('')
    setNotice('')
    setSaving(true)
    try {
      await api.updatePartner(partner.id, { name, supplyDiscountPct: pct })
      setNotice('Saved. Sales already made keep the discount they were rung up at.')
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function addLogin(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setAdding(true)
    try {
      await api.createPartnerLogin(partner.id, { email, password, displayName: partner.name })
      setEmail('')
      setPassword('')
      setNotice(`Login added. It signs in to ${partner.name}'s till, prices and sales only.`)
      await loadLogins()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function removeLogin(login) {
    if (!window.confirm(`Remove the login ${login.email}? It will be signed out and cannot sign in again.`)) return
    setError('')
    try {
      await api.deletePartnerLogin(partner.id, login.id)
      await loadLogins()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <section className="card settings-card partner-card">
      <div className="partner-card-head">
        <h3 className="sub">{partner.name}</h3>
        <div className="partner-card-links">
          <Link href={`/partners/${partner.id}`} className="ghost sm">Till</Link>
          <Link href={`/partners/${partner.id}/prices`} className="ghost sm">Menu &amp; prices</Link>
          <Link href={`/partners/${partner.id}/report`} className="ghost sm">Sales &amp; settlement</Link>
        </div>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {notice ? <p className="banner success" role="status">{notice}</p> : null}

      <div className="partner-form">
        <label className="field partner-field-name">
          <span>Partner name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label className="field partner-field-pct">
          <span>Discount off menu price</span>
          <span className="partner-pct">
            <input type="number" min={0} max={100} step="0.01" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
            <span aria-hidden="true">%</span>
          </span>
        </label>
        <button type="button" className="primary" disabled={!changed || saving || !name.trim()} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <PublicMenuLink partner={partner} tenantSlug={tenantSlug} />

      <h4 className="sub partner-subhead">Logins</h4>
      <p className="muted small partner-hint">
        A partner login sees only {partner.name}’s till, its menu and prices, and its own sales. Your own staff
        can open {partner.name}’s till from their usual login.
      </p>
      {logins === null ? <p className="muted small">Loading…</p> : logins.length === 0 ? (
        <p className="muted small">No logins yet.</p>
      ) : (
        <ul className="partner-logins">
          {logins.map((l) => (
            <li key={l.id}>
              <span>{l.email}</span>
              <button type="button" className="ghost danger sm" onClick={() => void removeLogin(l)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form className="partner-form" onSubmit={addLogin}>
        <label className="field partner-field-name">
          <span>Login email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
        </label>
        <label className="field partner-field-name">
          <span>Password (8+ characters)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
        </label>
        <button type="submit" className="primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add login'}
        </button>
      </form>
    </section>
  )
}

/**
 * The address of the partner's public menu, for its own website: the items it
 * sells now, at its prices, as JSON anyone may read. Nothing of the café's
 * prices or costs is in it (toPublicPartnerMenu).
 */
function PublicMenuLink({ partner, tenantSlug }) {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  if (!tenantSlug) return null
  const url = `${origin}/api/menu-public/partners/${encodeURIComponent(partner.slug)}?tenant=${encodeURIComponent(tenantSlug)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard refused (plain http on a LAN address); the box is selectable.
    }
  }

  return (
    <>
      <h4 className="sub partner-subhead">Website menu</h4>
      <p className="muted small partner-hint">
        For {partner.name}’s own website: the items it sells right now, at its prices. Hidden items are left out,
        and your prices, costs and the discount never appear. Changes show up within a minute.
      </p>
      <div className="partner-form">
        <label className="field partner-field-url">
          <span>Public menu address (JSON)</span>
          <input value={url} readOnly onFocus={(e) => e.target.select()} />
        </label>
        <button type="button" className="ghost" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
        <a className="ghost partner-open-link" href={url} target="_blank" rel="noreferrer">Open</a>
      </div>
    </>
  )
}
