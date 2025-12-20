import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const USERNAME_MIN_LEN = 3
const USERNAME_MAX_LEN = 30
const USERNAME_REGEX = /^[A-Za-z0-9_]+$/

export default function SetUsernamePage() {
  const navigate = useNavigate()
  const { profile, profileLoading, updateProfile } = useAuth()

  const [username, setUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const normalized = useMemo(() => username.trim(), [username])

  // If user already has a username, no need to stay here.
  if (profile && profile.has_set_username) {
    // Avoid rendering flashes; navigate after first paint.
    setTimeout(() => navigate('/', { replace: true }), 0)
    return null
  }

  const clientValidationError = (() => {
    if (!normalized) return 'Username is required'
    if (normalized.length < USERNAME_MIN_LEN) return `Username must be at least ${USERNAME_MIN_LEN} characters`
    if (normalized.length > USERNAME_MAX_LEN) return `Username must be at most ${USERNAME_MAX_LEN} characters`
    if (!USERNAME_REGEX.test(normalized)) return 'Use only letters, numbers, and underscores'
    return ''
  })()

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (clientValidationError) {
      setError(clientValidationError)
      return
    }

    setSubmitting(true)
    try {
      const res = await updateProfile(normalized)
      if (!res.success) {
        setError(res.error || 'Failed to set username')
        return
      }

      navigate('/', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Pick a username</h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a username to participate in the community. This name will be shown instead of your email.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
              Username
            </label>
            <input
              id="username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              inputMode="text"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              placeholder="e.g. lumina_user"
              aria-invalid={Boolean(error)}
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-slate-500">{USERNAME_MIN_LEN}–{USERNAME_MAX_LEN} chars, letters/numbers/_</p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || profileLoading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save username'}
          </button>
        </form>
      </div>
    </div>
  )
}
