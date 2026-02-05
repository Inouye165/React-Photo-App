import { request } from './httpClient'
import type { WhiteboardHistoryResponse, WhiteboardSnapshotResponse } from '../types/whiteboard'

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

  return request<{ token: string; expiresInMs: number }>({
    path: `/api/whiteboard/${encodeURIComponent(boardId)}/ws-token`,
    method: 'POST',
    headers,
    signal,
  })
}
