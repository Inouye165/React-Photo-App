/// <reference lib="webworker" />
type StockfishEngine = {
  postMessage: (command: string) => void
  onmessage: ((event: MessageEvent | string) => void) | null
}

type StockfishFactory = (options?: {
  locateFile?: (file: string, prefix?: string) => string
}) => StockfishEngine

let engine: StockfishEngine | null = null
let stockfishUrl: string | null = null
let stockfishWasmUrl: string | null = null

function ensureEngine(): StockfishEngine {
  if (engine) return engine
  if (!stockfishUrl) {
    throw new Error('Stockfish URL not provided')
  }
  if (!stockfishWasmUrl) {
    throw new Error('Stockfish WASM URL not provided')
  }

  const wasmUrl = stockfishWasmUrl

  importScripts(stockfishUrl)

  const factory = (self as unknown as { Stockfish?: StockfishFactory; STOCKFISH?: StockfishFactory }).Stockfish
    ?? (self as unknown as { STOCKFISH?: StockfishFactory }).STOCKFISH

  if (typeof factory !== 'function') {
    throw new Error('Stockfish factory not found')
  }

  engine = factory({
    locateFile: (file: string) => {
      if (file.endsWith('.wasm')) return wasmUrl
      if (file.endsWith('.wasm.map')) return `${wasmUrl}.map`
      return file
    },
  })
  engine.onmessage = (event) => {
    const data = typeof event === 'string' ? event : event.data
    self.postMessage(data)
  }

  return engine
}

self.onmessage = (event: MessageEvent) => {
  const payload = event.data

  if (payload?.type === 'init') {
    if (typeof payload?.stockfishUrl === 'string') {
      stockfishUrl = payload.stockfishUrl
    }
    if (typeof payload?.stockfishWasmUrl === 'string') {
      stockfishWasmUrl = payload.stockfishWasmUrl
    }
    ensureEngine()
    self.postMessage({ type: 'ready' })
    return
  }

  const command = typeof payload === 'string' ? payload : payload?.command
  if (!command) return

  const active = ensureEngine()
  active.postMessage(command)
}
