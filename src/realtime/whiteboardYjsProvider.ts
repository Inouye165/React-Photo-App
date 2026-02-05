import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export type WhiteboardYjsConnectionStatus = 'connected' | 'disconnected'

export type WhiteboardYjsProvider = {
  doc: Y.Doc
  provider: WebsocketProvider
  destroy: () => void
}

export function buildWhiteboardWebsocketUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/+$/, '')
  const url = new URL(base)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = new URL(`${protocol}//${url.host}/api/v1/events/whiteboard`)
  return wsUrl.toString()
}

export function createWhiteboardYjsProvider(options: {
  apiBaseUrl: string
  boardId: string
  token: string
  wsToken?: string
  onStatus?: (status: WhiteboardYjsConnectionStatus) => void
}): WhiteboardYjsProvider {
  const { apiBaseUrl, boardId, token, wsToken, onStatus } = options
  const doc = new Y.Doc()
  const wsUrl = buildWhiteboardWebsocketUrl(apiBaseUrl)

  const provider = new WebsocketProvider(wsUrl, boardId, doc, {
    params: wsToken ? { ws_token: wsToken } : { token },
  })

  provider.on('status', (event: { status: WhiteboardYjsConnectionStatus }) => {
    onStatus?.(event.status)
  })

  return {
    doc,
    provider,
    destroy: () => {
      provider.destroy()
      doc.destroy()
    },
  }
}
