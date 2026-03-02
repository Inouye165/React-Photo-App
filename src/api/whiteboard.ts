import { ApiError, request } from './httpClient'
import type { WhiteboardHistoryResponse, WhiteboardSnapshotResponse } from '../types/whiteboard'

const whiteboardApiLogOnceKeys = new Set<string>()

function wbApiWarnOnce(key: string, message: string, details: Record<string, unknown>) {
  if (whiteboardApiLogOnceKeys.has(key)) return
  whiteboardApiLogOnceKeys.add(key)
  console.warn(message, details)
}

export async function fetchWhiteboardHistory(options: {
  boardId: string
  token: string
  signal?: AbortSignal
}): Promise<WhiteboardHistoryResponse> {
  const { boardId, token, signal } = options

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }

  return request<WhiteboardHistoryResponse>({
    path: `/api/whiteboard/${encodeURIComponent(boardId)}/history`,
    method: 'GET',
    headers,
    signal,
  })
}

export async function fetchWhiteboardSnapshot(options: {
  boardId: string
  token: string
  signal?: AbortSignal
}): Promise<WhiteboardSnapshotResponse> {
  const { boardId, token, signal } = options

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }

  return request<WhiteboardSnapshotResponse>({
    path: `/api/whiteboard/${encodeURIComponent(boardId)}/snapshot`,
    method: 'GET',
    headers,
    signal,
  })
}

export async function fetchWhiteboardWsToken(options: {
  boardId: string
  token: string
  signal?: AbortSignal
}): Promise<{ token: string; expiresInMs: number }> {
  const { boardId, token, signal } = options

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }

  const path = `/api/whiteboard/${encodeURIComponent(boardId)}/ws-token`

  try {
    return await request<{ token: string; expiresInMs: number }>({
      path,
      method: 'POST',
      headers,
      signal,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      const details = error.details as { requestId?: unknown; request_id?: unknown } | undefined
      const requestId =
        typeof details?.requestId === 'string'
          ? details.requestId
          : typeof details?.request_id === 'string'
            ? details.request_id
            : undefined

      wbApiWarnOnce(
        `ws-token-fail:${boardId}:${error.status ?? 'unknown'}`,
        '[WB-CLIENT] ws-token request failed',
        {
          boardId,
          path,
          status: error.status ?? 'unknown',
          requestId: requestId ?? null,
        },
      )

      if (error.status === 404) {
        wbApiWarnOnce(
          `ws-token-404:${boardId}`,
          '[WB-CLIENT] ws-token 404. Likely not a member (whiteboard endpoints return 404 for non-members).',
          { boardId, path },
        )
      }
    }

    throw error
  }
}
