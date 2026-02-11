/// <reference lib="webworker" />
type StockfishEngine = {
  postMessage: (command: string) => void
  onmessage: ((event: MessageEvent | string) => void) | null
}

type StockfishFactory = (options?: {
  locateFile?: (file: string, prefix?: string) => string
}) => StockfishEngine

let engine: StockfishEngine | null = null
const STOCKFISH_JS_URL = '/stockfish/stockfish-17.1-lite-single-03e3232.js'
const STOCKFISH_WASM_URL = '/stockfish/stockfish-17.1-lite-single-03e3232.wasm'

function ensureEngine(): StockfishEngine {
  if (engine) return engine

  importScripts(STOCKFISH_JS_URL)

  const factory = (self as unknown as { Stockfish?: StockfishFactory; STOCKFISH?: StockfishFactory }).Stockfish
    ?? (self as unknown as { STOCKFISH?: StockfishFactory }).STOCKFISH

  if (typeof factory !== 'function') {
    throw new Error('Stockfish factory not found')
  }

  engine = factory({
    locateFile: (file: string) => {
      if (file.endsWith('.wasm')) return STOCKFISH_WASM_URL
      if (file.endsWith('.wasm.map')) return `${STOCKFISH_WASM_URL}.map`
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
    ensureEngine()
    self.postMessage({ type: 'ready' })
    return
  }

  const command = typeof payload === 'string' ? payload : payload?.command
  if (!command) return

  const active = ensureEngine()
  active.postMessage(command)
}
