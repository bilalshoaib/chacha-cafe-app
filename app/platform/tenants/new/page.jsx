'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PendingLink } from '@/components/NavPending.jsx'
import { api } from '@/api.js'
import { STARTER_MENUS } from '@/constants/starterMenus.js'
import BrandingFields, { DEFAULT_BRANDING_FORM, LogoPicker } from '@/components/BrandingFields.jsx'
import { useToast } from '@/context/ToastContext.jsx'
import { TRIAL_DAYS_DEFAULT, TRIAL_DAYS_MAX } from '@/lib/tenantAccess.js'
import LocaleFields from '@/components/LocaleFields.jsx'

/**
 * Creating a café.
 *
 * Grouped into what the business is, who runs it, and how it is set up —
 * three questions in the order somebody would answer them, rather than one
 * long column of fields.
 *
 * Only one answer here is awkward to change later: how many counters the
 * business runs. It is asked outright rather than assumed, because most cafés
 * have one menu and one that does must never be shown a counter picker on
 * every menu item and every expense.
 *
 * Everything else is a starting point the owner edits from their own settings.
 *
 * Appearance is offered here but never required. The argument against it — a
 * console that configures each customer is a console that has to be used for
 * every customer — holds only if it is compulsory. Left blank, the café gets
 * the product's own palette and looks deliberate; filled in, the owner signs
 * in to something already wearing their colours, which is the difference
 * between a handover and a to-do list.
 */
export default function NewTenantPage() {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [plan, setPlan] = useState('trial')
  const [trialDays, setTrialDays] = useState(String(TRIAL_DAYS_DEFAULT))
  const [separateCounters, setSeparateCounters] = useState(false)
  const [counterNames, setCounterNames] = useState(['', ''])
  const [starter, setStarter] = useState('cafe')
  const [currency, setCurrency] = useState('PKR')
  const [timezone, setTimezone] = useState('Asia/Karachi')
  const [locale, setLocale] = useState('en-PK')
  const [branding, setBranding] = useState(DEFAULT_BRANDING_FORM)
  // Held in memory until the café exists to attach it to, then sent with the
  // rest of the form. There is nothing to upload against before that.
  const [logo, setLogo] = useState(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)

  const autoSlug = slug || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const chosenMenu = STARTER_MENUS.find((m) => m.id === starter)

  async function submit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      setCreated(await api.createTenant({
        name, slug: autoSlug, ownerEmail, ownerName, plan,
        ...(plan === 'trial' ? { trialDays: Number(trialDays) } : {}),
        brandNames: separateCounters ? counterNames.filter((c) => c.trim()) : [],
        starterMenu: starter, currency, timezone, locale,
        ...branding,
        logo: logo ? { mime: logo.mime, data: logo.data } : null,
      }))
      toast.success(`${name} created.`)
    } catch (err) {
      setError(err.message || 'Could not create the café.')
      toast.error(err.message || 'Could not create the café.')
    } finally {
      setSaving(false)
    }
  }

  // Shown once. The password is stored only as a hash, so this screen is the
  // only chance to write it down.
  if (created) {
    return (
      <main className="platform-page">
        <div className="platform-head">
          <div>
            <h1>{created.tenant.name} is ready</h1>
            <p className="muted small">
              Hand these details over. The password appears here and nowhere else —
              if it is lost, reset it rather than look it up.
            </p>
          </div>
        </div>

        <div className="pf-card handover-card">
          <dl className="handover">
            <dt>Sign in with</dt>
            <dd><code>{created.owner.email}</code></dd>
            <dt>Password</dt>
            <dd><code className="handover-password">{created.owner.temporaryPassword}</code></dd>
          </dl>
          {created.logoError ? (
            <p className="banner error" role="alert">
              The café was created, but the logo was not stored: {created.logoError} Upload it again from the café’s page.
            </p>
          ) : null}
          <p>They should change it from Settings once they have signed in.</p>
          <div className="pf-actions">
            <PendingLink href={`/platform/tenants/${created.tenant.id}`} className="primary btn-link">Open café</PendingLink>
            <button type="button" className="ghost" onClick={() => router.push('/platform')}>All cafés</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="platform-page">
      <div className="platform-head">
        <div>
          <PendingLink href="/platform" className="platform-back">← All cafés</PendingLink>
          <h1>New café</h1>
          <p className="muted small">
            Sets up the business, its first branch, its menu categories and the owner’s account.
          </p>
        </div>
      </div>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <form className="pf-card pf-form" onSubmit={submit}>
        <fieldset className="pf-fieldset">
          <legend>The business</legend>

          <label className="pf-field">
            <span>Business name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Gloria’s Coffee" />
          </label>

          <label className="pf-field">
            <span>URL name</span>
            <input value={autoSlug} onChange={(e) => setSlug(e.target.value)} placeholder="gloriascoffee" />
            <span className="pf-hint">Used in their web address. Letters and numbers only.</span>
          </label>

          {/* Chosen from a list rather than typed. A free-text box here was
              three characters away from a café whose every price rendered in a
              currency Intl has never heard of, and it offered no way to set the
              language at all — so every café created got Pakistani English
              whatever country it was in. */}
          <div className="pf-row">
            <LocaleFields
              currency={currency}
              locale={locale}
              onCurrencyChange={setCurrency}
              onLocaleChange={setLocale}
              disabled={saving}
              fieldClass="pf-field"
            />
          </div>

          <label className="pf-field">
            <span>Timezone</span>
            <input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            <span className="pf-hint">An IANA name, like America/Chicago or Asia/Karachi.</span>
          </label>
        </fieldset>

        <fieldset className="pf-fieldset">
          <legend>Who runs it</legend>

          <label className="pf-field">
            <span>Owner email</span>
            <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required placeholder="owner@gloriascoffee.pk" />
            <span className="pf-hint">Their sign-in. We create the account and give you a password to pass on.</span>
          </label>

          <label className="pf-field">
            <span>Owner name <span className="pf-hint">optional</span></span>
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Gloria" />
          </label>

          <label className="pf-field">
            <span>Plan</span>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="trial">Trial</option>
              <option value="standard">Standard</option>
              <option value="multi-branch">Multi-branch</option>
            </select>
          </label>

          {/* Only a trial has a clock, so only a trial asks for one. */}
          {plan === 'trial' ? (
            <label className="pf-field">
              <span>Trial length</span>
              <input
                type="number"
                min={1}
                max={TRIAL_DAYS_MAX}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
              <span className="pf-hint">
                Days from today. When it runs out they are signed out and cannot sign back in until
                you extend it or move them onto a paid plan. You can change it at any time.
              </span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="pf-fieldset">
          <legend>How it looks</legend>
          <p className="pf-hint">
            Optional. Left alone, the café gets the product’s own colours and can be re-skinned at any time.
          </p>

          <BrandingFields value={branding} onChange={setBranding}>
            <LogoPicker
              previewUrl={logo?.previewUrl ?? null}
              onPick={(picked) => setLogo(picked)}
              onRemove={() => setLogo(null)}
            />
          </BrandingFields>
        </fieldset>

        <fieldset className="pf-fieldset">
          <legend>How it is set up</legend>

          <div className="pf-field">
            <span>Counters</span>
            <label className="radio-row">
              <input type="radio" name="counters" checked={!separateCounters} onChange={() => setSeparateCounters(false)} />
              <span>
                <strong>One menu</strong>
                <span className="pf-hint block">The usual case. Nothing in the app mentions counters.</span>
              </span>
            </label>
            <label className="radio-row">
              <input type="radio" name="counters" checked={separateCounters} onChange={() => setSeparateCounters(true)} />
              <span>
                <strong>Separate counters</strong>
                <span className="pf-hint block">
                  Two menus under one roof, reported separately — a café and a burger bar side by side.
                </span>
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
          </div>

          <label className="pf-field">
            <span>Menu style</span>
            <select value={starter} onChange={(e) => setStarter(e.target.value)}>
              {STARTER_MENUS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <span className="pf-hint">
              {chosenMenu?.categories.length
                ? `Starts with ${chosenMenu.categories.map((c) => c.label).join(', ')}. They can rename, reorder and delete them.`
                : chosenMenu?.description}
            </span>
          </label>
        </fieldset>

        <div className="pf-submit">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create café'}
          </button>
          <PendingLink href="/platform" className="ghost btn-link">Cancel</PendingLink>
        </div>
      </form>
    </main>
  )
}
