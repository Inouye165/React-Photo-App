import { request } from './httpClient'
import type { WhiteboardHistoryResponse } from '../types/whiteboard'

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
