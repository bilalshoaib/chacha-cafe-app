'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler } from '@/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  const refreshAuth = useCallback(async () => {
    try {
      const r = await api.me()
      const ok = Boolean(r.authenticated)
      setAuthenticated(ok)
      setUser(ok && r.user ? r.user : null)
    } catch {
      setAuthenticated(false)
      setUser(null)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthenticated(false)
      setUser(null)
    })
  }, [])

  const login = useCallback(async (email, password) => {
    const r = await api.login(email, password)
    setAuthenticated(true)
    setUser(r.user ?? null)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setAuthenticated(false)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      authenticated,
      user,
      authLoading,
      login,
      logout,
      refreshAuth,
    }),
    [authenticated, user, authLoading, login, logout, refreshAuth],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
