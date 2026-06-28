'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch, throwIfNotOk } from '@/lib/api-fetch'

type PlatformAdminUser = {
  id: string
  name: string | null
  email: string | null
}

export type PlatformAdminCheckError = {
  kind: 'request'
  message: string
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function usePlatformAdminCheck(enabled: boolean) {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [user, setUser] = useState<PlatformAdminUser | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<PlatformAdminCheckError | null>(null)

  const reset = useCallback(() => {
    setIsPlatformAdmin(false)
    setUser(null)
    setLoading(false)
    setChecked(false)
    setError(null)
  }, [])

  const check = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!enabled) {
      reset()
      return
    }

    setLoading(true)
    setChecked(false)
    setError(null)

    try {
      const response = await apiFetch('/api/platform/admin/check')

      if (response.status === 401 || response.status === 403) {
        if (!isCancelled()) {
          setIsPlatformAdmin(false)
          setUser(null)
          setError(null)
        }
        return
      }

      await throwIfNotOk(response, 'Platform admin check failed')

      const data = await response.json().catch(() => null) as {
        isAdmin?: boolean
        user?: PlatformAdminUser | null
      } | null

      if (!isCancelled()) {
        setIsPlatformAdmin(Boolean(data?.isAdmin))
        setUser(data?.user ?? null)
        setError(null)
      }
    } catch (requestError) {
      if (!isCancelled()) {
        setIsPlatformAdmin(false)
        setUser(null)
        setError({
          kind: 'request',
          message: getErrorMessage(requestError, 'Platform admin check failed'),
        })
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false)
        setChecked(true)
      }
    }
  }, [enabled, reset])

  const refetch = useCallback(() => check(), [check])

  useEffect(() => {
    let cancelled = false
    void check(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [check])

  return {
    isPlatformAdmin,
    user,
    loading: enabled && (!checked || loading),
    error,
    refetch,
    retry: refetch,
  }
}
