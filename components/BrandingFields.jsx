'use client'
import { useRef, useState } from 'react'
import { BRAND_PRIMARY, BRAND_SECONDARY } from '@/constants/theme.js'

/**
 * How a café looks: its two colours, its tagline, its logo, the line at the
 * bottom of its receipts.
 *
 * Shared by the create and edit screens so a café cannot be given a look on
 * the way in that it has no way to change afterwards, and so the two forms
 * cannot drift apart in what they offer.
 *
 * The colours are the whole palette. Every ramp, surface, border and shadow in
 * the stylesheets is derived from these two custom properties, so the preview
 * below is not decoration — it is the closest thing to seeing the result
 * without saving, and it is why the fields are worth grouping on one card
 * rather than scattering among the business details.
 */

/** Empty means "use the product's palette", which is what the database stores. */
export const DEFAULT_BRANDING_FORM = {
  tagline: '',
  brandPrimary: '',
  brandSecondary: '',
  receiptFooter: '',
}

/** Fills the form from a tenant record, turning nulls into empty inputs. */
export function brandingFormOf(tenant) {
  return {
    tagline: tenant?.tagline ?? '',
    brandPrimary: tenant?.brandPrimary ?? '',
    brandSecondary: tenant?.brandSecondary ?? '',
    receiptFooter: tenant?.receiptFooter ?? '',
  }
}

/** What the app will actually paint with, once the blanks fall back. */
function effective(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

/**
 * One colour: a swatch that opens the operating system's picker, and the hex
 * beside it.
 *
 * Both, rather than either. The picker is how somebody chooses a colour they
 * are looking for; the hex box is how they paste the one their designer sent,
 * which is the more common case here and is impossible with a picker alone.
 */
function ColourField({ label, hint, value, fallback, onChange }) {
  const shown = effective(value, fallback)
  return (
    <div className="pf-field pf-colour-field">
      <span>{label}</span>
      <div className="pf-colour-row">
        <input
          type="color"
          className="pf-swatch"
          aria-label={`${label} — colour picker`}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="pf-hex"
          aria-label={`${label} — hex value`}
          value={value}
          placeholder={fallback}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        {value ? (
          <button type="button" className="ghost sm" onClick={() => onChange('')}>
            Reset
          </button>
        ) : null}
      </div>
      <span className="pf-hint">{hint}</span>
    </div>
  )
}

/**
 * Reads a chosen file as base64, the form the upload route takes.
 *
 * The size is checked here as well as on the server. The server's check is the
 * one that counts; this one exists so somebody on a café's connection is told
 * their photograph is too big before spending a minute sending it.
 */
const MAX_LOGO_BYTES = 512 * 1024
const ACCEPTED = 'image/png,image/jpeg,image/webp,image/svg+xml'

export function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file chosen.')); return }
    if (file.size > MAX_LOGO_BYTES) {
      reject(new Error(`The logo must be under ${MAX_LOGO_BYTES / 1024} KB — this one is ${Math.round(file.size / 1024)} KB.`))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.onload = () => {
      const url = String(reader.result)
      resolve({ mime: file.type, data: url.slice(url.indexOf(',') + 1), previewUrl: url })
    }
    reader.readAsDataURL(file)
  })
}

/**
 * The logo: a preview of what is there, and the two things that can be done
 * to it.
 *
 * `previewUrl` is either the café's stored logo or a data URL of one just
 * chosen and not yet saved — the same picture either way, so the preview does
 * not need to know which it is looking at.
 */
export function LogoPicker({ previewUrl, busy = false, onPick, onRemove, hint }) {
  const inputRef = useRef(null)
  const [error, setError] = useState('')

  async function choose(file) {
    setError('')
    try {
      await onPick(await readLogoFile(file))
    } catch (e) {
      setError(e.message || 'That file could not be used.')
    } finally {
      // Cleared so choosing the same file twice fires a change event the
      // second time — otherwise a failed upload cannot simply be retried.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="pf-field">
      <span>Logo</span>
      <div className="pf-logo-row">
        <div className={`pf-logo-preview${previewUrl ? '' : ' is-empty'}`}>
          {previewUrl
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={previewUrl} alt="" />
            : <span aria-hidden="true">No logo</span>}
        </div>
        <div className="pf-logo-actions">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="pf-file"
            disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f) }}
          />
          {previewUrl && onRemove ? (
            <button type="button" className="ghost sm danger" disabled={busy} onClick={() => void onRemove()}>
              Remove logo
            </button>
          ) : null}
        </div>
      </div>
      {error ? <span className="pf-hint pf-hint-error">{error}</span> : null}
      <span className="pf-hint">
        {hint ?? 'PNG, JPEG, WebP or SVG, under 512 KB. A square or wide mark on a transparent background works best.'}
      </span>
    </div>
  )
}

/**
 * The text and colour half of a café's appearance. The logo sits outside it so
 * that the create form, which has no café to upload against yet, and the edit
 * form, which uploads immediately, can each handle the file their own way.
 */
export default function BrandingFields({ value, onChange, children }) {
  const set = (key) => (v) => onChange({ ...value, [key]: v })
  const primary = effective(value.brandPrimary, BRAND_PRIMARY)
  const secondary = effective(value.brandSecondary, BRAND_SECONDARY)

  return (
    <>
      <div className="pf-row">
        <ColourField
          label="Main colour"
          hint="Buttons, headers and links. Needs to be dark enough for white text."
          value={value.brandPrimary}
          fallback={BRAND_PRIMARY}
          onChange={set('brandPrimary')}
        />
        <ColourField
          label="Accent colour"
          hint="Highlights and prices. Needs to read against dark surfaces."
          value={value.brandSecondary}
          fallback={BRAND_SECONDARY}
          onChange={set('brandSecondary')}
        />
      </div>

      {/* Not a mock-up of the whole app — just the header, which is where both
          colours meet and where a bad pairing shows up first. */}
      <div
        className="pf-brand-preview"
        style={{ '--preview-primary': primary, '--preview-secondary': secondary }}
      >
        <span className="pf-preview-mark" aria-hidden="true" />
        <div className="pf-preview-text">
          <strong>Their header</strong>
          <span>{value.tagline || 'Their tagline'}</span>
        </div>
        <span className="pf-preview-btn" aria-hidden="true">Button</span>
        <span className="pf-preview-price" aria-hidden="true">Rs 450</span>
      </div>

      {children}

      <label className="pf-field">
        <span>Tagline <span className="pf-hint">optional</span></span>
        <input
          value={value.tagline}
          maxLength={160}
          onChange={(e) => set('tagline')(e.target.value)}
          placeholder="Good Food ★ Good Mood"
        />
        <span className="pf-hint">Sits under their name in the app header.</span>
      </label>

      <label className="pf-field">
        <span>Receipt footer <span className="pf-hint">optional</span></span>
        <input
          value={value.receiptFooter}
          maxLength={200}
          onChange={(e) => set('receiptFooter')(e.target.value)}
          placeholder="Thank you — see you soon!"
        />
        <span className="pf-hint">The last line printed on every receipt. Their name is used if left blank.</span>
      </label>
    </>
  )
}
