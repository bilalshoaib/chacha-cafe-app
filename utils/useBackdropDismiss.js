'use client'
import { useRef } from 'react'

/**
 * Closes a native <dialog> when the backdrop is clicked.
 *
 * A <dialog> fills only its own box, but the click target for the dark area
 * around it is still the dialog element — so a click whose target is the
 * dialog itself, landing outside its rectangle, is a backdrop click.
 *
 * Both mousedown and click must land on the backdrop. Without that, selecting
 * text inside the form and releasing the mouse outside it would count as an
 * outside click and throw away everything the user had typed.
 *
 * Pass `disabled` while saving, so an accidental click can't close a dialog
 * mid-request — the same guard the Esc key already has via onCancel.
 */
export default function useBackdropDismiss(disabled = false) {
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
      if (!inside) e.currentTarget.close()
    },
  }
}
