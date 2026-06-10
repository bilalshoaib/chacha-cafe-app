'use client'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext.jsx'

export default function RequireSuperAdmin({ children }) {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.replace('/settings')
    }
  }, [user, router])

  if (!user) return null
  if (user.role !== 'super_admin') return null
  return children
}
