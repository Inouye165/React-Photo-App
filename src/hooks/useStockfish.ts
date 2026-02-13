import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Difficulty = 'Easy' | 'Medium' | 'Hard'

type TopMove = {
  uci: string
  score: number | null
  mate: number | null
  depth: number | null
}

type EngineEval = {
  score: number | null
  mate: number | null
}

type PendingMove = {
  resolve: (move: string) => void
  reject: (error: Error) => void
}

type QueuedEngineMove = {
  fen: string
  movetime: number
  resolve: (move: string) => void
  reject: (error: Error) => void
}

type AnalysisEntry = {
  multipv: number
  uci: string
  score: number | null
  mate: number | null
  depth: number | null
}

const difficultySettings: Record<Difficulty, { movetime: number; skill: number }> = {
  Easy: { movetime: 200, skill: 6 },
  Medium: { movetime: 500, skill: 12 },
  Hard: { movetime: 900, skill: 18 },
}

const DEFAULT_STOCKFISH_WORKER_PATH = '/stockfish/stockfish-17.1-lite-single-03e3232.js'

function resolveStockfishWorkerPath() {
  const configuredPath = import.meta.env.VITE_STOCKFISH_WORKER_PATH
  if (typeof configuredPath !== 'string' || !configuredPath.trim()) {
    return DEFAULT_STOCKFISH_WORKER_PATH
  }

  const normalized = configuredPath.trim()
  if (!normalized.startsWith('/stockfish/')) {
    return DEFAULT_STOCKFISH_WORKER_PATH
  }

  return normalized
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeScore(score: number, turn: 'w' | 'b') {
  const signed = turn === 'b' ? -score : score
  return clamp(signed / 100, -9, 9)
}

function isLikelyValidFen(fen: string) {
  const fenParts = fen.split(' ')
  return fenParts.length >= 4 && /^[rnbqkpRNBQKP1-8/]+$/.test(fenParts[0])
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null)
  const pendingMoveRef = useRef<PendingMove | null>(null)
  const pendingMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFenRef = useRef<string | null>(null)
  const analysisRef = useRef<Map<number, AnalysisEntry>>(new Map())
  const readyRef = useRef(false)
  const searchingRef = useRef(false)
  const skillRef = useRef(difficultySettings.Medium.skill)
  const movetimeRef = useRef(difficultySettings.Medium.movetime)
  const queuedAnalysisFenRef = useRef<string | null>(null)
  const queuedEngineMoveRef = useRef<QueuedEngineMove | null>(null)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartAttemptsRef = useRef(0)

  const [isReady, setIsReady] = useState(false)
  const [difficulty, setDifficultyState] = useState<Difficulty>('Medium')
  const [topMoves, setTopMoves] = useState<TopMove[]>([])
  const [evaluation, setEvaluation] = useState<EngineEval>({ score: null, mate: null })

  const settings = useMemo(() => difficultySettings[difficulty], [difficulty])

  const sendCommand = useCallback((command: string) => {
    const worker = workerRef.current
    if (!worker) return
    worker.postMessage(command)
  }, [])

  const clearPendingMoveTimeout = useCallback(() => {
    if (!pendingMoveTimeoutRef.current) return
    clearTimeout(pendingMoveTimeoutRef.current)
    pendingMoveTimeoutRef.current = null
  }, [])

  const stopSearchIfNeeded = useCallback(() => {
    if (!searchingRef.current) return
    sendCommand('stop')
  }, [sendCommand])

  const cancelPendingMove = useCallback(() => {
    queuedAnalysisFenRef.current = null
    if (queuedEngineMoveRef.current) {
      queuedEngineMoveRef.current.reject(new Error('Engine move cancelled'))
      queuedEngineMoveRef.current = null
    }
    stopSearchIfNeeded()
    clearPendingMoveTimeout()
    if (pendingMoveRef.current) {
      pendingMoveRef.current.reject(new Error('Engine move cancelled'))
      pendingMoveRef.current = null
    }
  }, [clearPendingMoveTimeout, stopSearchIfNeeded])

  const startAnalysisSearch = useCallback((fen: string) => {
    lastFenRef.current = fen
    analysisRef.current.clear()
    setTopMoves([])
    setEvaluation({ score: null, mate: null })
    sendCommand(`position fen ${fen}`)
    sendCommand(`go movetime ${movetimeRef.current}`)
    searchingRef.current = true
  }, [sendCommand])

  const startEngineMoveSearch = useCallback((request: QueuedEngineMove) => {
    pendingMoveRef.current = { resolve: request.resolve, reject: request.reject }
    lastFenRef.current = request.fen
    clearPendingMoveTimeout()
    sendCommand(`position fen ${request.fen}`)
    sendCommand(`go movetime ${request.movetime}`)
    searchingRef.current = true
    const timeoutMs = Math.max(request.movetime * 6, 3000)
    pendingMoveTimeoutRef.current = setTimeout(() => {
      if (!pendingMoveRef.current) return
      searchingRef.current = false
      sendCommand('stop')
      pendingMoveRef.current.reject(new Error('Engine move timeout'))
      pendingMoveRef.current = null
      pendingMoveTimeoutRef.current = null
    }, timeoutMs)
  }, [clearPendingMoveTimeout, sendCommand])

  const handleInfoLine = useCallback((line: string) => {
    const multipvMatch = line.match(/\bmultipv (\d+)/)
    const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/)
    const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/)
    const depthMatch = line.match(/\bdepth (\d+)/)

    if (!multipvMatch || !pvMatch) return

    const multipv = Number(multipvMatch[1])
    const uci = pvMatch[1]
    const depth = depthMatch ? Number(depthMatch[1]) : null

    let score: number | null = null
    let mate: number | null = null
    if (scoreMatch) {
      const type = scoreMatch[1]
      const value = Number(scoreMatch[2])
      if (type === 'cp') score = value
      if (type === 'mate') mate = value
    }

    analysisRef.current.set(multipv, { multipv, uci, score, mate, depth })

    const entries = [...analysisRef.current.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .slice(0, 3)

    const normalizedTopMoves = entries.map((entry) => ({
      uci: entry.uci,
      score: entry.score,
      mate: entry.mate,
      depth: entry.depth,
    }))

    setTopMoves(normalizedTopMoves)

    if (entries[0]) {
      const turn = (lastFenRef.current?.split(' ')[1] as 'w' | 'b') || 'w'
      if (typeof entries[0].score === 'number') {
        setEvaluation({ score: normalizeScore(entries[0].score, turn), mate: null })
      } else if (typeof entries[0].mate === 'number') {
        const mateScore = entries[0].mate
        const signed = turn === 'b' ? -mateScore : mateScore
        setEvaluation({ score: signed > 0 ? 9 : -9, mate: mateScore })
      }
    }
  }, [])

  const handleMessage = useCallback((raw: unknown) => {
    if (!raw) return
    if (typeof raw === 'object' && (raw as { type?: string }).type === 'ready') {
      return
    }

    const line = typeof raw === 'string' ? raw : String(raw)

    if (line === 'uciok') {
      sendCommand('setoption name MultiPV value 3')
      sendCommand(`setoption name Skill Level value ${skillRef.current}`)
      sendCommand('isready')
      return
    }

    if (line === 'readyok') {
      readyRef.current = true
      setIsReady(true)
      return
    }

    if (line.startsWith('info ')) {
      handleInfoLine(line)
      return
    }

    if (line.startsWith('bestmove')) {
      const match = line.match(/bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/)
      const bestMove = match?.[1]
      searchingRef.current = false
      clearPendingMoveTimeout()
      if (pendingMoveRef.current) {
        if (bestMove) {
          pendingMoveRef.current.resolve(bestMove)
        } else {
          pendingMoveRef.current.reject(new Error('Engine did not return bestmove'))
        }
        pendingMoveRef.current = null
      }

      if (queuedEngineMoveRef.current) {
        const request = queuedEngineMoveRef.current
        queuedEngineMoveRef.current = null
        startEngineMoveSearch(request)
        return
      }

      if (queuedAnalysisFenRef.current) {
        const fen = queuedAnalysisFenRef.current
        queuedAnalysisFenRef.current = null
        startAnalysisSearch(fen)
      }
    }
  }, [clearPendingMoveTimeout, handleInfoLine, sendCommand, startAnalysisSearch, startEngineMoveSearch])

  useEffect(() => {
    skillRef.current = settings.skill
    movetimeRef.current = settings.movetime
  }, [settings.movetime, settings.skill])

  useEffect(() => {
    // Use the Stockfish JS file directly as the Worker — it auto-initializes
    // the WASM engine and listens for UCI commands via postMessage/onmessage.
    // Do NOT wrap it in a custom worker; the Stockfish script is a complete
    // Web Worker that derives the .wasm path from self.location.
    const spawnWorker = () => {
      const worker = new Worker(resolveStockfishWorkerPath())
      workerRef.current = worker
      worker.onmessage = (event) => handleMessage(event.data)
      worker.onerror = () => {
        readyRef.current = false
        setIsReady(false)
        searchingRef.current = false
        queuedAnalysisFenRef.current = null
        if (queuedEngineMoveRef.current) {
          queuedEngineMoveRef.current.reject(new Error('Stockfish worker crashed'))
          queuedEngineMoveRef.current = null
        }
        clearPendingMoveTimeout()
        pendingMoveRef.current?.reject(new Error('Stockfish worker crashed'))
        pendingMoveRef.current = null
        if (restartAttemptsRef.current < 2) {
          restartAttemptsRef.current += 1
          restartTimerRef.current = setTimeout(() => {
            spawnWorker()
          }, 500)
        }
      }
      worker.onmessageerror = () => {
        readyRef.current = false
        setIsReady(false)
      }
      // Send UCI init — Stockfish queues commands until WASM is ready
      worker.postMessage('uci')
    }

    spawnWorker()

    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current)
        restartTimerRef.current = null
      }
      clearPendingMoveTimeout()
      queuedAnalysisFenRef.current = null
      if (queuedEngineMoveRef.current) {
        queuedEngineMoveRef.current.reject(new Error('Stockfish worker terminated'))
        queuedEngineMoveRef.current = null
      }
      pendingMoveRef.current?.reject(new Error('Stockfish worker terminated'))
      pendingMoveRef.current = null
      if (workerRef.current) {
        workerRef.current.postMessage('quit')
        workerRef.current.terminate()
      }
      workerRef.current = null
    }
  }, [clearPendingMoveTimeout, handleMessage])

  useEffect(() => {
    if (!readyRef.current) return
    sendCommand(`setoption name Skill Level value ${settings.skill}`)
  }, [sendCommand, settings.skill])

  const analyzePosition = useCallback((fen: string) => {
    if (!readyRef.current) return
    if (!isLikelyValidFen(fen)) return
    if (pendingMoveRef.current || queuedEngineMoveRef.current) return

    if (searchingRef.current) {
      queuedAnalysisFenRef.current = fen
      sendCommand('stop')
      return
    }

    startAnalysisSearch(fen)
  }, [sendCommand, startAnalysisSearch])

  const getEngineMove = useCallback((fen: string) => {
    if (!readyRef.current) return Promise.reject(new Error('Stockfish not ready'))
    if (pendingMoveRef.current || queuedEngineMoveRef.current) return Promise.reject(new Error('Engine already thinking'))
    if (!isLikelyValidFen(fen)) {
      return Promise.reject(new Error('Invalid FEN'))
    }

    return new Promise<string>((resolve, reject) => {
      const request: QueuedEngineMove = {
        fen,
        movetime: settings.movetime,
        resolve,
        reject,
      }

      queuedAnalysisFenRef.current = null

      if (searchingRef.current) {
        queuedEngineMoveRef.current = request
        sendCommand('stop')
        return
      }

      startEngineMoveSearch(request)
    })
  }, [sendCommand, settings.movetime, startEngineMoveSearch])

  const setDifficulty = useCallback((level: Difficulty) => {
    setDifficultyState(level)
  }, [])

  return {
    isReady,
    difficulty,
    setDifficulty,
    analyzePosition,
    getEngineMove,
    cancelPendingMove,
    topMoves,
    evaluation,
  }
}
