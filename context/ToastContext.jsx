'use client'
import { createContext, useCallback, useContext, useState } from 'react'

const ToastContext = createContext(null)

let _nextId = 0
const DURATION_MS = 4000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((message, type) => {
    const id = ++_nextId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => dismiss(id), DURATION_MS)
  }, [dismiss])

  const success = useCallback((message) => addToast(message, 'success'), [addToast])
  const error = useCallback((message) => addToast(message, 'error'), [addToast])

  return (
    <ToastContext.Provider value={{ toasts, success, error, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
