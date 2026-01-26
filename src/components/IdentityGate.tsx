import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import { usePhotoProcessingEvents } from '../hooks/usePhotoProcessingEvents'
import { useCaptureIntentListener } from '../hooks/useCaptureIntentListener'

export type IdentityGateStatus =
  | { type: 'allow' }
  | { type: 'loading'; message: string }
  | { type: 'error'; message: string }
  | { type: 'redirect'; to: string }

type IdentityGateLayout = 'page' | 'inline'

function IdentityGateFrame({ layout, children }: { layout: IdentityGateLayout; children: ReactNode }) {
  const sizeClass = layout === 'page' ? 'min-h-screen' : 'h-full min-h-0'
  return <div className={`${sizeClass} flex items-center justify-center bg-gray-50`}>{children}</div>
}

function IdentityGateView({ status, layout }: { status: IdentityGateStatus; layout: IdentityGateLayout }) {
  if (status.type === 'loading') {
    return (
      <IdentityGateFrame layout={layout}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">{status.message}</p>
        </div>
      </IdentityGateFrame>
    )
  }

  if (status.type === 'error') {
    return (
      <IdentityGateFrame layout={layout}>
        <div className="text-center max-w-md px-4">
          <p className="text-slate-900 font-semibold">Could not load your profile</p>
          <p className="mt-2 text-sm text-slate-600">{status.message}</p>
          <p className="mt-3 text-sm text-slate-600">Please refresh and try again.</p>
        </div>
      </IdentityGateFrame>
    )
  }

  return null
}

export function useIdentityGateStatus(): IdentityGateStatus {
  const location = useLocation()
  const { user, authReady, profile, profileLoading, profileError } = useAuth()

  // Allow the reset-password (account setup) flow to complete without being hijacked
  // by the username gate. This keeps onboarding deterministic.
  const isOnboardingPage = location.pathname === '/reset-password'

  // Not authenticated: AuthWrapper handles rendering the landing/login.
  if (!user) return { type: 'allow' }

  // If we are on the setup page, let the setup page handle its own logic.
  if (isOnboardingPage) return { type: 'allow' }

  // Wait until we have token readiness before calling it.
  if (!authReady) {
    return { type: 'loading', message: 'Initializing…' }
  }

  // Profile is required to decide the gate.
  if (profileLoading || (!profile && !profileError)) {
    return { type: 'loading', message: 'Loading your profile…' }
  }

  if (profileError) {
    return { type: 'error', message: profileError }
  }

  if (profile && profile.has_set_username === false) {
    return { type: 'redirect', to: '/reset-password' }
  }

  return { type: 'allow' }
}

export function IdentityGateInline({ status }: { status?: IdentityGateStatus }) {
  const resolvedStatus = status ?? useIdentityGateStatus()

  if (resolvedStatus.type === 'allow') return null
  if (resolvedStatus.type === 'redirect') return <Navigate to={resolvedStatus.to} replace />

  return <IdentityGateView status={resolvedStatus} layout="inline" />
}

export default function IdentityGate() {
  const { user, authReady } = useAuth()
  const status = useIdentityGateStatus()

  // Phase 3: realtime SSE for photo processing completion.
  // This is intentionally wired once at the top-level gate to avoid multiple
  // concurrent streams per tab.
  usePhotoProcessingEvents({ authed: Boolean(user && authReady) })
  useCaptureIntentListener({ enabled: Boolean(user && authReady) })

  if (status.type === 'allow') return <Outlet />
  if (status.type === 'redirect') return <Navigate to={status.to} replace />

  return <IdentityGateView status={status} layout="page" />
}
