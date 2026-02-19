import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { getUsernameValidationError } from '../lib/usernameValidation'

const PASSWORD_MIN_LEN = 6

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { updatePassword, updateProfile, user, session, profile, loading: authLoading, profileLoading } = useAuth()

  const [password, setPassword] = useState<string>('')
  const [confirmPassword, setConfirmPassword] = useState<string>('')
  const [username, setUsername] = useState<string>('')

  const [submitting, setSubmitting] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<boolean>(false)

  const [processingRecoveryLink, setProcessingRecoveryLink] = useState<boolean>(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    return hash.includes('type=recovery') || hash.includes('type=invite') || search.includes('code=')
  })

  const needsUsername = profile?.has_set_username === false
  const isSetup = Boolean(needsUsername)

  const normalizedUsername = useMemo(() => username.trim(), [username])

  const usernameError = useMemo(() => {
    if (!needsUsername) return ''
    return getUsernameValidationError(normalizedUsername)
  }, [needsUsername, normalizedUsername])

  useEffect(() => {
    let cancelled = false

    async function maybeFinalizeRecovery(): Promise<void> {
      if (!processingRecoveryLink) return

      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')

        // Hash-based recovery doesn't need this; code-based flows do.
        if (code && supabase?.auth?.exchangeCodeForSession) {
          await supabase.auth.exchangeCodeForSession(code)
        } else {
          // Hash flow: give Supabase time to process the hash and fire onAuthStateChange
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      } catch {
        // best-effort: if this fails, lack of a session will trigger the redirect below
      } finally {
        if (!cancelled) setProcessingRecoveryLink(false)
      }
    }

    void maybeFinalizeRecovery()

    return () => {
      cancelled = true
    }
  }, [processingRecoveryLink])

  // Defense in depth: if we cannot establish a valid session after processing invite/recovery,
  // route back to landing so the user cannot interact with a broken state.
  useEffect(() => {
    if (!authLoading && !processingRecoveryLink && !session) {
      if (window.location.hash.includes('error=')) {
        navigate('/' + window.location.hash)
      } else {
        navigate('/')
      }
    }
  }, [session, authLoading, processingRecoveryLink, navigate])

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (needsUsername) {
      if (usernameError) {
        setError(usernameError)
        setSubmitting(false)
        return
      }
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setSubmitting(false)
      return
    }

    if (password.length < PASSWORD_MIN_LEN) {
      setError(`Password must be at least ${PASSWORD_MIN_LEN} characters`)
      setSubmitting(false)
      return
    }

    try {
      const pwResult = await updatePassword(password)
      const passwordError = String(pwResult.error || '')
      const isSamePasswordValidation =
        passwordError.toLowerCase().includes('different from the old password')
        || passwordError.toLowerCase().includes('new password should be different')

      if (!pwResult.success && !(needsUsername && isSamePasswordValidation)) {
        throw new Error(passwordError || 'Failed to update password')
      }

      if (needsUsername) {
        const profileResult = await updateProfile(normalizedUsername)
        if (!profileResult.success) {
          throw new Error(profileResult.error || 'Failed to set username')
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/gallery')
      }, 2500)
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : ''
      setError(message || 'Setup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || processingRecoveryLink || (session && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
          <p className="mt-4 text-gray-600">{processingRecoveryLink ? 'Verifying link...' : 'Loading profile...'}</p>
        </div>
      </div>
    )
  }

  if (!session || !user) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{isSetup ? 'Create Account' : 'Reset Password'}</h1>
          <p className="text-sm text-gray-600">
            {isSetup ? 'Set up your username and password' : 'Enter your new password below'}
          </p>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 p-6 text-center">
            <svg
              className="mx-auto h-10 w-10 text-green-400 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
            </svg>
            <h3 className="text-lg font-semibold text-green-800 mb-1">{isSetup ? 'Account Created' : 'Password Updated'}</h3>
            <p className="text-sm text-green-700 mb-2">Redirecting you to the gallery...</p>
          </div>
        ) : (
          <form className="space-y-6" onSubmit={onSubmit} noValidate>
            {error ? (
              <div className="rounded-md bg-red-50 p-3 text-center text-red-700 text-sm font-medium" role="alert">
                {error}
              </div>
            ) : null}

            {isSetup ? (
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  placeholder="Choose a unique username"
                  minLength={3}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                />
                <p className="mt-1 text-xs text-gray-500">3–30 chars, letters/numbers/_</p>
              </div>
            ) : null}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {isSetup ? 'Password' : 'New Password'}
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                minLength={PASSWORD_MIN_LEN}
              />
              <p className="mt-1 text-xs text-gray-500">Use a password different from your current one.</p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                minLength={PASSWORD_MIN_LEN}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || Boolean(usernameError)}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Updating...' : isSetup ? 'Complete Setup' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
