'use client'
import { useEffect, useId, useRef } from 'react'
import useBackdropDismiss from '@/utils/useBackdropDismiss.js'

/**
 * The one modal used across the app, wrapping a native <dialog>.
 *
 * Every dialog previously repeated the same four things by hand: a ref, an
 * effect calling showModal()/close(), an onClose that reset state, and an
 * onCancel guarding Esc during a save. Getting one of them wrong is invisible
 * until a user hits it, so they live here once.
 *
 * Two shapes:
 *   - `onSubmit` given  → body and footer are wrapped in a <form>, so the
 *     footer's submit button drives it and Enter works in any field.
 *   - `actions` given   → arbitrary footer buttons (confirmations, dangerous
 *     actions) with no form semantics.
 *
 * `busy` is the single "a request is in flight" flag: it blocks Esc, the
 * backdrop, and the close button together, so a modal can't vanish mid-save.
 */
export default function Modal({
  open,
  onClose,
  busy = false,
  title,
  subtitle,
  size = 'default', // 'default' | 'wide' | 'compact'
  onSubmit,
  actions,
  submitLabel,
  busyLabel = 'Saving…',
  children,
}) {
  const ref = useRef(null)
  const titleId = useId()

  // Every close route funnels through here so the parent's state always moves
  // first and the dialog element follows it in the effect below. Calling
  // dialog.close() directly instead left state saying "open" while the dialog
  // was shut, and it could then never be reopened.
  const requestClose = () => { if (!busy) onClose?.() }
  const backdrop = useBackdropDismiss(busy, requestClose)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  }, [open])

  const sizeClass =
    size === 'wide' ? ' form-dialog-wide' : size === 'compact' ? ' form-dialog-compact' : ''

  const body = (
    <>
      <div className="form-dialog-body">{children}</div>
      <footer className="form-dialog-foot">
        {actions ?? (
          <button type="submit" className="primary" disabled={busy}>
            {busy ? busyLabel : submitLabel}
          </button>
        )}
      </footer>
    </>
  )

  return (
    <dialog
      ref={ref}
      className={`confirm-dialog form-dialog${sizeClass}`}
      aria-labelledby={titleId}
      // Esc: always handled here rather than letting the browser close the
      // element behind React's back, for the same state-sync reason as above.
      onCancel={(e) => { e.preventDefault(); requestClose() }}
      {...backdrop}
    >
      <header className="form-dialog-head">
        <div className="form-dialog-head-text">
          <h2 id={titleId} className="form-dialog-title">{title}</h2>
          {subtitle ? <p className="form-dialog-sub">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="form-dialog-close"
          onClick={requestClose}
          disabled={busy}
          aria-label="Close"
        >
          ×
        </button>
      </header>

      {onSubmit ? (
        <form className="form-dialog-form" onSubmit={onSubmit}>{body}</form>
      ) : (
        <div className="form-dialog-form">{body}</div>
      )}
    </dialog>
  )
}

/** Cancel + a primary submit — the footer nearly every form dialog wants. */
export function FormActions({ onCancel, busy, submitLabel, busyLabel = 'Saving…' }) {
  return (
    <>
      <button type="button" className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </>
  )
}

/** Cancel + a destructive action, for confirmations. */
export function ConfirmActions({ onCancel, onConfirm, busy, confirmLabel, busyLabel = 'Working…' }) {
  return (
    <>
      <button type="button" className="ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="danger-solid" onClick={onConfirm} disabled={busy}>
        {busy ? busyLabel : confirmLabel}
      </button>
    </>
  )
}
