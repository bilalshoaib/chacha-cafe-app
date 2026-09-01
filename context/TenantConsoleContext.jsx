'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/api.js'
import { brandingFormOf } from '@/components/BrandingFields.jsx'
import { useToast } from '@/context/ToastContext.jsx'
import { tradingDay, DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR } from '@/lib/tradingDay.js'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@/constants/locales.js'
import { DEFAULT_TIMEZONE } from '@/constants/timezones.js'

const TenantConsoleContext = createContext(null)

/**
 * One café, held once for the whole of its console.
 *
 * The detail screen used to be a single page holding every action, and every
 * action's state with it. Splitting it into tabs made that untenable: six
 * pages each fetching the same café would mean six requests on the way in and
 * six copies of "has this been saved" to keep in step. So the fetch, the
 * drafts and the writes live here, in the layout that wraps all six, and each
 * tab is left holding only its own form.
 *
 * The drafts are deliberately here rather than in the tabs. A half-typed name
 * survives a trip to the Trail tab and back, which is what somebody comparing
 * a change against the record needs it to do.
 */
export function TenantConsoleProvider({ children }) {
  const { id } = useParams()
  const toast = useToast()

  const [tenant, setTenant] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  // Held in state rather than refetched: it is returned once and never stored
  // in a readable form, so leaving the console is what loses it.
  const [issued, setIssued] = useState(null)

  // The editable forms are drafts until saved, so a half-typed name never
  // reaches the café. Seeded once the café arrives and reseeded on every
  // successful save, which is what discards a failed edit cleanly.
  const [details, setDetails] = useState(
    {
      name: '', slug: '',
      dayStartHour: DEFAULT_DAY_START_HOUR, dayEndHour: DEFAULT_DAY_END_HOUR,
      timezone: DEFAULT_TIMEZONE,
      currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE,
    },
  )
  const [branding, setBranding] = useState(brandingFormOf(null))

  const adopt = useCallback((t) => {
    setTenant(t)
    // The draft names its hours as the API takes them, not as the rules
    // express them, so the Details form can be handed straight to save().
    const hours = tradingDay(t)
    setDetails({
      name: t.name ?? '',
      slug: t.slug ?? '',
      dayStartHour: hours.startHour,
      dayEndHour: hours.endHour,
      timezone: t.timezone ?? DEFAULT_TIMEZONE,
      currency: t.currency ?? DEFAULT_CURRENCY,
      locale: t.locale ?? DEFAULT_LOCALE,
    })
    setBranding(brandingFormOf(t))
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const t = await api.getTenant(id)
        if (!cancelled) adopt(t)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load this café.')
      }
    })()
    return () => { cancelled = true }
  }, [id, adopt])

  /** A write that leaves the drafts alone — a button, not a form. */
  const patch = useCallback(async (fields, note) => {
    setError(''); setMessage(''); setSaving(true)
    try {
      const updated = await api.updateTenant(id, fields)
      setTenant((prev) => ({ ...prev, ...updated }))
      setMessage(note)
      toast.success(note)
      return updated
    } catch (e) {
      setError(e.message || 'Could not save.')
      toast.error(e.message || 'Could not save.')
      return null
    } finally {
      setSaving(false)
    }
  }, [id, toast])

  /** A form save, which reseeds the drafts from what the server actually stored. */
  const save = useCallback(async (fields, note) => {
    const updated = await patch(fields, note)
    if (updated) adopt({ ...tenant, ...updated })
  }, [patch, adopt, tenant])

  const uploadLogo = useCallback(async (picked) => {
    setError(''); setMessage(''); setLogoBusy(true)
    try {
      adopt({ ...tenant, ...(await api.uploadTenantLogo(id, picked)) })
      setMessage('Logo updated.')
      toast.success('Logo updated.')
    } catch (e) {
      setError(e.message || 'Could not store that logo.')
      toast.error(e.message || 'Could not store that logo.')
    } finally {
      setLogoBusy(false)
    }
  }, [id, tenant, adopt, toast])

  const removeLogo = useCallback(async () => {
    setError(''); setMessage(''); setLogoBusy(true)
    try {
      adopt({ ...tenant, ...(await api.removeTenantLogo(id)) })
      setMessage('Logo removed.')
      toast.success('Logo removed.')
    } catch (e) {
      setError(e.message || 'Could not remove the logo.')
      toast.error(e.message || 'Could not remove the logo.')
    } finally {
      setLogoBusy(false)
    }
  }, [id, tenant, adopt, toast])

  const resetPassword = useCallback(async () => {
    setError(''); setMessage(''); setSaving(true)
    try {
      const res = await api.resetOwnerPassword(id)
      setIssued(res.owner)
      // Refetched so the reset appears in the trail beside it.
      adopt(await api.getTenant(id))
      setMessage('New password issued — it is shown once, below.')
      toast.success('New password issued — it is shown once, below.')
    } catch (e) {
      setError(e.message || 'Could not issue a password.')
      toast.error(e.message || 'Could not issue a password.')
    } finally {
      setSaving(false)
    }
  }, [id, adopt, toast])

  const destroy = useCallback(async (confirmName) => {
    setError(''); setMessage(''); setSaving(true)
    try {
      await api.deleteTenant(id, { confirmName })
      toast.success('Café deleted.')
      // Full load: the console chrome around this café is about to 404, and the
      // list it lands on needs a fresh read anyway.
      window.location.assign('/platform')
      return true
    } catch (e) {
      setError(e.message || 'Could not delete this café.')
      toast.error(e.message || 'Could not delete this café.')
      setSaving(false)
      return false
    }
  }, [id, toast])

  const openAs = useCallback(async (control) => {
    setError('')
    try {
      await api.impersonate(id, control)
      toast.success(control
        ? `Support session open on ${tenant?.name ?? 'this café'} — you can make changes.`
        : `Viewing ${tenant?.name ?? 'this café'}, read-only.`)
      // Full load rather than push + refresh: the app is about to be wearing
      // this café's name, colours and logo, and those are resolved by the
      // server-rendered layout that a client-side navigation keeps in place.
      window.location.assign('/')
    } catch (e) {
      setError(e.message || 'Could not open this café.')
      toast.error(e.message || 'Could not open this café.')
    }
  }, [id, tenant, toast])

  const value = useMemo(() => ({
    id, tenant, error, message, saving, logoBusy, issued,
    details, setDetails, branding, setBranding,
    adopt, patch, save, uploadLogo, removeLogo, resetPassword, openAs, destroy,
  }), [
    id, tenant, error, message, saving, logoBusy, issued,
    details, branding, adopt, patch, save, uploadLogo, removeLogo, resetPassword, openAs, destroy,
  ])

  return <TenantConsoleContext.Provider value={value}>{children}</TenantConsoleContext.Provider>
}

export function useTenantConsole() {
  const ctx = useContext(TenantConsoleContext)
  if (!ctx) throw new Error('useTenantConsole must be used within TenantConsoleProvider')
  return ctx
}
