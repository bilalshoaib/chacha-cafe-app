'use client'
import { useRef } from 'react'

/**
 * Detects a click on a native <dialog>'s backdrop and calls `onDismiss`.
 *
 * A <dialog> fills only its own box, but the click target for the dark area
 * around it is still the dialog element — so a click whose target is the
 * dialog itself, landing outside its rectangle, is a backdrop click.
 *
 * Both mousedown and click must land on the backdrop. Without that, selecting
 * text inside the form and releasing the mouse outside it would count as an
 * outside click and throw away everything the user had typed.
 *
 * This reports the intent rather than calling dialog.close() itself: the
 * owning component closes by flipping its own state, so React state stays the
 * single source of truth. Closing the DOM node directly desynced them — the
 * dialog's `close` event does not reliably reach React's onClose, leaving
 * state stuck open and the dialog impossible to reopen.
 *
 * Pass `disabled` while saving so an accidental click can't close a dialog
 * mid-request.
 */
export default function useBackdropDismiss(disabled = false, onDismiss) {
  const startedOnBackdrop = useRef(false)

  return {
    onMouseDown(e) {
      startedOnBackdrop.current = e.target === e.currentTarget
    },
    onClick(e) {
      const startedOutside = startedOnBackdrop.current
      startedOnBackdrop.current = false
      if (disabled || !startedOutside || e.target !== e.currentTarget) return

      // A click on the dialog's own scrollbar also targets the dialog, and its
      // coordinates are inside the box — the rect check keeps that from closing.
      const r = e.currentTarget.getBoundingClientRect()
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (!inside) onDismiss?.()
    },
  }
}
