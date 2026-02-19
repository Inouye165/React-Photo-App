import type { Session } from '@supabase/supabase-js'

import { supabase } from './supabaseClient'
import { authDebug } from '../utils/authDebug'

let inFlight: Promise<Session | null> | null = null

/**
 * Set to `true` when getSessionSingleflight encounters an invalid refresh token
 * and auto-signs out. AuthContext reads this flag to show a user-facing message.
 */
export let lastSessionWasInvalidRefreshToken = false

/** Reset the flag (e.g. after AuthContext has consumed it). */
export function clearInvalidRefreshTokenFlag(): void {
  lastSessionWasInvalidRefreshToken = false
}

function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (!err || typeof err !== 'object') return ''

  const maybe = err as { message?: unknown; error_description?: unknown; description?: unknown }
  if (typeof maybe.message === 'string') return maybe.message
  if (typeof maybe.error_description === 'string') return maybe.error_description
  if (typeof maybe.description === 'string') return maybe.description
  return ''
}

function isInvalidRefreshTokenError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase()
  if (!msg) return false
  return msg.includes('invalid refresh token') || msg.includes('refresh token not found')
}

export async function getSessionSingleflight(): Promise<Session | null> {
  if (inFlight) {
    authDebug('getSessionSingleflight:reuse-inflight')
    return inFlight
  }

  inFlight = (async (): Promise<Session | null> => {
    try {
      authDebug('getSessionSingleflight:request')
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      authDebug('getSessionSingleflight:success', {
        hasSession: Boolean(data.session),
        expiresAt: data.session?.expires_at ?? null,
      })
      return data.session ?? null
    } catch (err: unknown) {
      if (isInvalidRefreshTokenError(err)) {
        authDebug('getSessionSingleflight:invalid_refresh_token', {
          message: getErrorMessage(err),
        })
        lastSessionWasInvalidRefreshToken = true
        try {
          await supabase.auth.signOut()
        } catch {
          // ignore
        }
        return null
      }
      authDebug('getSessionSingleflight:error', { message: getErrorMessage(err) })
      throw err
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export async function getAccessTokenSingleflight(): Promise<string | null> {
  const session = await getSessionSingleflight()
  return session?.access_token ?? null
}
