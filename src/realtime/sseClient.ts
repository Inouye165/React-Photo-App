export type SseFrame = {
  event: string | null
  id: string | null
  data: string
}

export type SseClient = {
  close: () => void
  closed: Promise<void>
}

export type ConnectPhotoEventsParams = {
  apiBaseUrl: string
  token: string
  onEvent: (frame: SseFrame) => void
  onError?: (err: unknown) => void
  signal?: AbortSignal
  since?: string | number
}

function normalizeHeaderValue(value: string | null): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function createSseParser(onEvent: (frame: SseFrame) => void) {
  let buffer = ''

  let currentEvent: string | null = null
  let currentId: string | null = null
  let dataLines: string[] = []

  const dispatch = () => {
    // Ignore empty dispatches
    if (!currentEvent && !currentId && dataLines.length === 0) return

    const data = dataLines.join('\n')
    onEvent({ event: currentEvent, id: currentId, data })

    currentEvent = null
    currentId = null
    dataLines = []
  }

  const processLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine

    // Blank line ends the event
    if (line === '') {
      dispatch()
      return
    }

    // Comment/heartbeat line (e.g. ": ping")
    if (line.startsWith(':')) return

    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    let value = idx === -1 ? '' : line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'event') {
      currentEvent = value || null
      return
    }

    if (field === 'id') {
      currentId = value || null
      return
    }

    if (field === 'data') {
      dataLines.push(value)
      return
    }

    // Ignore other fields (retry, etc)
  }

  return {
    feedText(textChunk: string) {
      if (!textChunk) return
      buffer += textChunk

      while (true) {
        const nlIndex = buffer.indexOf('\n')
        if (nlIndex === -1) break

        const line = buffer.slice(0, nlIndex)
        buffer = buffer.slice(nlIndex + 1)
        processLine(line)
      }
    },
    flush() {
      // If the stream ends without a trailing newline, we should still process
      // the final line, but only dispatch on a terminating blank line.
      if (buffer) {
        processLine(buffer)
        buffer = ''
      }
    },
  }
}

export async function connectPhotoEvents(params: ConnectPhotoEventsParams): Promise<SseClient> {
  const { apiBaseUrl, token, onEvent, onError, signal, since } = params

  if (!apiBaseUrl || typeof apiBaseUrl !== 'string') {
    throw new Error('apiBaseUrl is required')
  }
  if (!token || typeof token !== 'string') {
    throw new Error('token is required')
  }

  const controller = new AbortController()
  const combinedSignal = signal
  if (combinedSignal) {
    if (combinedSignal.aborted) controller.abort()
    else combinedSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const urlObj = new URL(`${apiBaseUrl.replace(/\/$/, '')}/events/photos`)
  const sinceValue = since === undefined || since === null ? '' : String(since).trim()
  if (sinceValue) {
    urlObj.searchParams.set('since', sinceValue)
  }
  const url = urlObj.toString()

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    signal: controller.signal,
    cache: 'no-store',
  })

  if (!response.ok) {
    controller.abort()
    throw new Error(`SSE connect failed (HTTP ${response.status})`)
  }

  const contentType = normalizeHeaderValue(response.headers.get('content-type'))
  if (!contentType.includes('text/event-stream')) {
    controller.abort()
    throw new Error('SSE connect failed (unexpected content-type)')
  }

  if (!response.body) {
    controller.abort()
    throw new Error('SSE connect failed (missing response body)')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const parser = createSseParser(onEvent)

  let resolveClosed: (() => void) | null = null
  let rejectClosed: ((e: unknown) => void) | null = null
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve
    rejectClosed = reject
  })

  const pump = async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          const text = decoder.decode(value, { stream: true })
          parser.feedText(text)
        }
      }
      // Flush any final decoded bytes
      try {
        const rest = decoder.decode(undefined, { stream: false })
        if (rest) parser.feedText(rest)
      } catch {
        // ignore
      }
      parser.flush()
      resolveClosed?.()
    } catch (err) {
      if (controller.signal.aborted) {
        resolveClosed?.()
        return
      }
      try {
        onError?.(err)
      } catch {
        // ignore handler errors
      }
      rejectClosed?.(err)
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
      try {
        controller.abort()
      } catch {
        // ignore
      }
    }
  }

  // Start reading in the background.
  void pump()

  return {
    close: () => {
      try {
        controller.abort()
      } catch {
        // ignore
      }
    },
    closed,
  }
}
