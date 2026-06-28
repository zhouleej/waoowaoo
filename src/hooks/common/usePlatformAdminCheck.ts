'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-fetch'

type PlatformAdminUser = {
  id: string
  name: string | null
  email: string | null
}

export function usePlatformAdminCheck(enabled: boolean) {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [user, setUser] = useState<PlatformAdminUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsPlatformAdmin(false)
      setUser(null)
      setLoading(false)
      setChecked(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setChecked(false)

    apiFetch('/api/platform/admin/check')
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) {
            setIsPlatformAdmin(false)
            setUser(null)
          }
          return
        }

        const data = await res.json().catch(() => null) as {
          isAdmin?: boolean
          user?: PlatformAdminUser | null
        } | null

        if (!cancelled) {
          setIsPlatformAdmin(Boolean(data?.isAdmin))
          setUser(data?.user ?? null)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsPlatformAdmin(false)
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setChecked(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return {
    isPlatformAdmin,
    user,
    loading: enabled && (!checked || loading),
  }
}
