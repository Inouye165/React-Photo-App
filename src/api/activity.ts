import { request } from './httpClient'
import { getAuthHeaders } from './auth'

export type ActivityAction =
  | 'sign_in'
  | 'sign_out'
  | 'password_change'
  | 'username_set'
  | 'page_view'
  | 'game_played'
  | 'message_sent'
  | 'auto_logout_inactive'

export type ActivityEntry = {
  id: string
  action: ActivityAction
  metadata: Record<string, unknown>
  created_at: string
}

/**
 * Log a user activity event to the server.
 * Fire-and-forget – errors are caught and logged but never thrown.
 */
export async function logActivity(
  action: ActivityAction,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await request<{ success: boolean }>({
      path: '/api/v1/activity',
      method: 'POST',
      headers: getAuthHeaders(),
      body: { action, metadata },
    })
  } catch (err) {
    // Activity logging is best-effort; never block the user.
    if (import.meta.env.DEV) {
      console.warn('[activity] Failed to log activity', action, err)
    }
  }
}

/**
 * Fetch the current user's recent activity log.
 */
export async function fetchActivityLog(
  limit = 50,
  offset = 0,
): Promise<ActivityEntry[]> {
  const res = await request<{ success: boolean; data: ActivityEntry[] }>({
    path: `/api/v1/activity?limit=${limit}&offset=${offset}`,
    method: 'GET',
    headers: getAuthHeaders(),
  })
  return res?.data ?? []
}
