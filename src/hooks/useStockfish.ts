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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeScore(score: number, turn: 'w' | 'b') {
  const signed = turn === 'b' ? -score : score
  return clamp(signed / 100, -9, 9)
}

export function useStockfish() {
  const workerRef = useRef<Worker | null>(null)
  const pendingMoveRef = useRef<PendingMove | null>(null)
  const lastFenRef = useRef<string | null>(null)
  const analysisRef = useRef<Map<number, AnalysisEntry>>(new Map())
  const readyRef = useRef(false)

  const [isReady, setIsReady] = useState(false)
  const [difficulty, setDifficultyState] = useState<Difficulty>('Medium')
  const [topMoves, setTopMoves] = useState<TopMove[]>([])
  const [evaluation, setEvaluation] = useState<EngineEval>({ score: null, mate: null })

  const settings = useMemo(() => difficultySettings[difficulty], [difficulty])

  const sendCommand = useCallback((command: string) => {
    const worker = workerRef.current
    if (!worker) return
    worker.postMessage({ command })
  }, [])

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
      sendCommand(`setoption name Skill Level value ${settings.skill}`)
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
      if (bestMove && pendingMoveRef.current) {
        pendingMoveRef.current.resolve(bestMove)
        pendingMoveRef.current = null
      }
    }
  }, [handleInfoLine, sendCommand, settings.skill])

  useEffect(() => {
    const worker = new Worker(new URL('../engine/stockfish.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event) => handleMessage(event.data)
    worker.postMessage({ type: 'init' })
    worker.postMessage({ command: 'uci' })

    return () => {
      pendingMoveRef.current?.reject(new Error('Stockfish worker terminated'))
      pendingMoveRef.current = null
      worker.terminate()
      workerRef.current = null
    }
  }, [handleMessage])

  useEffect(() => {
    if (!readyRef.current) return
    sendCommand(`setoption name Skill Level value ${settings.skill}`)
  }, [sendCommand, settings.skill])

  const analyzePosition = useCallback((fen: string) => {
    if (!readyRef.current) return
    lastFenRef.current = fen
    analysisRef.current.clear()
    setTopMoves([])
    setEvaluation({ score: null, mate: null })
    sendCommand(`position fen ${fen}`)
    sendCommand(`go movetime ${settings.movetime}`)
  }, [sendCommand, settings.movetime])

  const getEngineMove = useCallback((fen: string) => {
    if (!readyRef.current) return Promise.reject(new Error('Stockfish not ready'))
    if (pendingMoveRef.current) return Promise.reject(new Error('Engine already thinking'))

    lastFenRef.current = fen

    return new Promise<string>((resolve, reject) => {
      pendingMoveRef.current = { resolve, reject }
      sendCommand(`position fen ${fen}`)
      sendCommand(`go movetime ${settings.movetime}`)
    })
  }, [sendCommand, settings.movetime])

  const setDifficulty = useCallback((level: Difficulty) => {
    setDifficultyState(level)
  }, [])

  return {
    isReady,
    difficulty,
    setDifficulty,
    analyzePosition,
    getEngineMove,
    topMoves,
    evaluation,
  }
}
