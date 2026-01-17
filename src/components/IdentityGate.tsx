import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import { usePhotoProcessingEvents } from '../hooks/usePhotoProcessingEvents'
import { useCaptureIntentListener } from '../hooks/useCaptureIntentListener'

export default function IdentityGate() {
  const location = useLocation()
  const { user, authReady, profile, profileLoading, profileError } = useAuth()

  // Allow the reset-password (account setup) flow to complete without being hijacked
  // by the username gate. This keeps onboarding deterministic.
  const isOnboardingPage = location.pathname === '/reset-password'

  // Phase 3: realtime SSE for photo processing completion.
  // This is intentionally wired once at the top-level gate to avoid multiple
  // concurrent streams per tab.
  usePhotoProcessingEvents({ authed: Boolean(user && authReady) })
  useCaptureIntentListener({ enabled: Boolean(user && authReady) })

  // Not authenticated: AuthWrapper handles rendering the landing/login.
  if (!user) return <Outlet />

  // If we are on the setup page, let the setup page handle its own logic.
  if (isOnboardingPage) return <Outlet />

  // Wait until we have token readiness before calling it.
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">Initializing…</p>
        </div>
      </div>
    )
  }

  // Profile is required to decide the gate.
  if (profileLoading || (!profile && !profileError)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">Loading your profile…</p>
        </div>
      </div>
    )
  }

  if (profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <p className="text-slate-900 font-semibold">Could not load your profile</p>
          <p className="mt-2 text-sm text-slate-600">{profileError}</p>
          <p className="mt-3 text-sm text-slate-600">Please refresh and try again.</p>
        </div>
      </div>
    )
  }

  if (profile && profile.has_set_username === false) {
    return <Navigate to="/reset-password" replace />
  }

  return <Outlet />
}
