import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'

export default function IdentityGate() {
  const location = useLocation()
  const { user, authReady, profile, profileLoading, profileError } = useAuth()

  // Not authenticated: AuthWrapper handles rendering the landing/login.
  if (!user) return <Outlet />

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

  const onSetUsernamePage = location.pathname === '/set-username'

  if (profile && profile.has_set_username === false && !onSetUsernamePage) {
    return <Navigate to="/set-username" replace />
  }

  return <Outlet />
}
