/// <reference lib="webworker" />
import StockfishUrl from 'stockfish/src/stockfish-nnue-16-no-Worker.js?url'

type StockfishEngine = {
  postMessage: (command: string) => void
  onmessage: ((event: MessageEvent | string) => void) | null
}

let engine: StockfishEngine | null = null

function ensureEngine(): StockfishEngine {
  if (engine) return engine

  importScripts(StockfishUrl)

  const factory = (self as unknown as { Stockfish?: () => StockfishEngine; STOCKFISH?: () => StockfishEngine }).Stockfish
    ?? (self as unknown as { STOCKFISH?: () => StockfishEngine }).STOCKFISH

  if (typeof factory !== 'function') {
    throw new Error('Stockfish factory not found')
  }

  engine = factory()
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
