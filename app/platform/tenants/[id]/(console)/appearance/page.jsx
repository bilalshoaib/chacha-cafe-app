'use client'
import BrandingFields, { brandingFormOf, LogoPicker } from '@/components/BrandingFields.jsx'
import { useTenantConsole } from '@/context/TenantConsoleContext.jsx'

/**
 * A café's colours and logo, set from the console.
 *
 * This used to be somewhere the platform deliberately would not go, on the
 * reasoning that a café's identity belongs to its owner. That does not survive
 * a support call: the owner who wants their colours changed rings the person
 * who sold them the product, and "sign in and do it yourself" is not an answer
 * to give somebody standing at a till. Their own settings remain the ordinary
 * way to do it.
 */
export default function TenantAppearancePage() {
  const { tenant, branding, setBranding, save, saving, logoBusy, uploadLogo, removeLogo } = useTenantConsole()

  const dirty = JSON.stringify(branding) !== JSON.stringify(brandingFormOf(tenant))

  return (
    <form
      className="pf-card pf-form tenant-tab-single"
      onSubmit={(e) => { e.preventDefault(); void save(branding, 'Appearance saved.') }}
    >
      <h2>Appearance</h2>
      <p>
        Their two colours are the entire palette — every button, panel and border in their app is
        derived from them. Clearing one puts it back to the product’s own.
      </p>

      <BrandingFields value={branding} onChange={setBranding}>
        {/* Uploaded straight away rather than with the form: a picture is not
            a draft, and there is a café here to attach it to. */}
        <LogoPicker
          previewUrl={tenant.logoUrl}
          busy={logoBusy || saving}
          onPick={uploadLogo}
          onRemove={removeLogo}
        />
      </BrandingFields>

      <div className="pf-actions">
        <button type="submit" className="primary" disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save appearance'}
        </button>
        {dirty ? (
          <button type="button" className="ghost" disabled={saving} onClick={() => setBranding(brandingFormOf(tenant))}>
            Discard
          </button>
        ) : null}
      </div>
    </form>
  )
}
