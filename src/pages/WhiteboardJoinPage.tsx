import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { joinWhiteboardByToken } from '../api/whiteboards'
import { ApiError } from '../api/httpClient'

function getJoinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.details as { reason?: unknown } | undefined
    const reason = typeof details?.reason === 'string' ? details.reason : null
    if (reason === 'expired') return 'This join link has expired.'
    if (reason === 'used_up') return 'This join link has already been used.'
    if (reason === 'revoked') return 'This join link has been revoked.'
    if (reason === 'invalid_token') return 'This join link is invalid.'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Unable to join this whiteboard right now.'
}

export default function WhiteboardJoinPage(): React.JSX.Element {
  const { token: tokenFromPath } = useParams()
  const location = useLocation()
  // token can be provided as path param (/whiteboards/join/:token) or
  // as a query param (/?token=...) when using board-specific deep links.
  const token = tokenFromPath || new URLSearchParams(location.search).get('token') || undefined
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const attemptedTokenRef = React.useRef<string | null>(null)

  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing join token.')
      return
    }

    if (attemptedTokenRef.current === token) {
      return
    }
    attemptedTokenRef.current = token

    ;(async () => {
      try {
        const { roomId } = await joinWhiteboardByToken(token)
        navigate(`/whiteboards/${roomId}`, { replace: true })
      } catch (error) {
        setErrorMessage(getJoinErrorMessage(error))
      }
    })()
  }, [navigate, token])

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        {!errorMessage ? (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-semibold text-slate-900">Joining whiteboard…</h1>
            <p className="mt-2 text-sm text-slate-600">Please wait while we verify your invite link.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Couldn’t join whiteboard</h1>
            <p className="mt-2 text-sm text-slate-700">{errorMessage}</p>
            <Link to="/whiteboards" className="mt-4 inline-block rounded border px-3 py-2 text-sm font-medium text-slate-800">
              Back to Whiteboards
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
