'use client'
import { useToast } from '@/context/ToastContext.jsx'

export default function Toaster() {
  const { toasts, dismiss } = useToast()
  if (!toasts.length) return null
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="toast-message">{t.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
