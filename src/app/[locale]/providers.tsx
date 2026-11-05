'use client'

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { SessionProvider } from "next-auth/react"
import { ToastProvider } from "@/contexts/ToastContext"
import { QueryProvider } from "@/components/providers/QueryProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      <QueryProvider>
        <WorkspaceProvider>
          <ToastProvider>{children}</ToastProvider>
        </WorkspaceProvider>
      </QueryProvider>
    </SessionProvider>
  )
}
