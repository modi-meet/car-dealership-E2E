import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { api, ApiError } from './api'

export type Role = 'buyer' | 'consultant' | 'admin'
export type Me = { id: number; name: string; email: string; role: Role; showroom_id: number | null }

// who am i. 401 just means signed out, not an error
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<Me>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 5 * 60_000,
  })
}

export function useSignOut() {
  const qc = useQueryClient()
  return async () => {
    await api.post('/auth/logout')
    qc.setQueryData(['me'], null)
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
  }
}

// gate a route by role, bounce to sign in otherwise
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  const loc = useLocation()
  if (isLoading) return <div className="wrap py-24 text-center text-ink-3">…</div>
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  if (!roles.includes(me.role)) return <Navigate to="/" replace />
  return <>{children}</>
}
