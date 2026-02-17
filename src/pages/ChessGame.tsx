import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { abortGame, fetchGame, fetchGameMembers, makeMove, restartGame } from '../api/games'
import { analyzeGameForMe, ensureStoryAudio, getStoryAudioSetupStatus, preloadStoryAudioManifest, type ChessTutorAnalysis } from '../api/chessTutor'
import { createDirectorScriptForPage, type StoryDirectorAction, type StoryHighlightTone } from '../data/storyTimeline'
import Toast from '../components/Toast'
import type { GameMemberProfile, GameRow } from '../api/games'
import { supabase } from '../supabaseClient'
import { useGameRealtime } from '../hooks/useGameRealtime'
import { useAuth } from '../contexts/AuthContext'
import { useStockfish } from '../hooks/useStockfish'
import { findOpening } from '../data/chessOpenings'

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

type PendingPromotion = {
  from: Square
  to: Square
  fen: string
}

type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty-move'
  | 'draw'
  | 'aborted'
  | 'resigned'
  | null

type MoveRow = {
  ply: number
  uci: string
  created_by: string
  created_at: string
  fen_after?: string | null
  hint_used?: boolean | null
}

type MoveHistoryRow = {
  moveNumber: number
  white: string | null
  black: string | null
}

type HintMove = {
  uci: string
  san: string
}

type TutorTab = 'lesson' | 'history' | 'analyze'
type LessonSection = 'pieces' | 'board-notation' | 'attacks' | 'discovered-check'

type ChessLesson = {
  piece: 'Pawn' | 'Knight' | 'Bishop' | 'Rook' | 'Queen' | 'King'
  value: string
  explanation: string
  movement: string
  frames: string[]
  highlightSquares: string[]
}

type NotationGuideRow = {
  algebraic: string
  descriptive: string
  meaning: string
}

type NotationLineMove = {
  san: string
  descriptive: string
  explanation: string
  from: Square
  to: Square
  focusSquares: string[]
}

type TacticalPattern = {
  name: string
  category: 'Special move' | 'Tactic'
  explanation: string
  teachingNote: string
  san: string
  descriptive: string
  frames: string[]
  highlightSquares: string[]
  frameHighlights?: string[][]
  frameArrows?: Array<Array<[Square, Square]>>
  frameLabels?: string[]
}

type ChessHistoryEvent = {
  period: string
  title: string
  summary: string
  ruleChange: string
  imageUrl: string
  imageAlt: string
}

const CHESS_LESSONS: ChessLesson[] = [
  {
    piece: 'Pawn',
    value: '≈1 point',
    explanation: 'Pawns move forward one square. On their first move, they may advance two squares. Pawns capture one square diagonally forward.',
    movement: 'Opening example: White plays e4 from the standard starting position.',
    frames: buildFenFrames('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e4']),
    highlightSquares: ['e2', 'e3', 'e4'],
  },
  {
    piece: 'Knight',
    value: '≈3 points',
    explanation: 'Knights move in an L-shape: two squares in one direction and then one to the side. Knights can jump over pieces.',
    movement: 'Real opening sequence: after 1.e4 e5, White develops with 2.Nf3.',
    frames: buildFenFrames('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', ['Nf3']),
    highlightSquares: ['g1', 'f3', 'e5'],
  },
  {
    piece: 'Bishop',
    value: '≈3 points',
    explanation: 'Bishops move diagonally any number of squares. Each bishop stays on the same color squares for the whole game.',
    movement: 'Italian-style development: bishop from f1 to c4 to pressure f7.',
    frames: buildFenFrames('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', ['Bc4']),
    highlightSquares: ['f1', 'e2', 'd3', 'c4', 'f7'],
  },
  {
    piece: 'Rook',
    value: '≈5 points',
    explanation: 'Rooks move horizontally or vertically any number of squares. Rooks are strongest on open files and ranks.',
    movement: 'Rook power example: rook climbs from a4 to a8 (four squares) to pressure the 8th rank.',
    frames: [
      'r3k2r/1p3ppp/2n5/8/R7/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'R3k2r/1p3ppp/2n5/8/8/2N5/PP3PPP/4K2R w Kkq - 0 1',
    ],
    highlightSquares: ['a4', 'a5', 'a6', 'a7', 'a8'],
  },
  {
    piece: 'Queen',
    value: '≈9 points',
    explanation: 'The queen combines rook and bishop movement: she can move any number of squares in straight lines or diagonals.',
    movement: 'Queen example from d4: diagonal to g7, back to d4, straight forward to d7, back to d4, then horizontal to h4.',
    frames: [
      'r3k2r/p1p2p1p/2n5/8/3Q4/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'r3k2r/p1p2pQp/2n5/8/8/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'r3k2r/p1p2p1p/2n5/8/3Q4/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'r3k2r/p1pQ1p1p/2n5/8/8/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'r3k2r/p1p2p1p/2n5/8/3Q4/2N5/PP3PPP/4K2R w Kkq - 0 1',
      'r3k2r/p1p2p1p/2n5/8/7Q/2N5/PP3PPP/4K2R w Kkq - 0 1',
    ],
    highlightSquares: ['d4', 'e5', 'f6', 'g7', 'd5', 'd6', 'd7', 'e4', 'f4', 'g4', 'h4'],
  },
  {
    piece: 'King',
    value: 'Priceless',
    explanation: 'The king moves one square in any direction. Keep your king safe: if it is checkmated, the game ends.',
    movement: 'Realistic king move: king e2→d3 to step next to and protect the pawn on d4.',
    frames: buildFenFrames('8/8/3k4/8/3P4/8/4K3/8 w - - 0 1', ['Kd3']),
    highlightSquares: ['e2', 'd3', 'd4'],
  },
]

const CHESS_HISTORY_EVENTS: ChessHistoryEvent[] = [
  {
    period: 'c. 600 CE',
    title: 'Early Chaturanga in India',
    summary: 'The earliest known ancestor of chess appears in India as chaturanga, representing battlefield strategy with infantry, cavalry, elephants, and chariots.',
    ruleChange: 'Core idea introduced: a turn-based strategy game with distinct piece roles on an 8×8 board.',
    imageUrl: '/chess-history/chaturanga.svg',
    imageAlt: 'Illustration representing early chaturanga gameplay',
  },
  {
    period: 'c. 800–900 CE',
    title: 'Shatranj in Persia and the Islamic world',
    summary: 'Chess spreads west and evolves into shatranj, becoming a major intellectual game in Persian and Arabic culture.',
    ruleChange: 'Terminology and strategy literature mature; slower piece movement leads to long positional games.',
    imageUrl: '/chess-history/shatranj.svg',
    imageAlt: 'Illustration representing the shatranj era',
  },
  {
    period: 'c. 1000–1400 CE',
    title: 'Arrival in medieval Europe',
    summary: 'Through trade and cultural exchange, chess reaches Europe and becomes popular among nobles, scholars, and clergy.',
    ruleChange: 'European regional rule variants appear, setting up future standardization.',
    imageUrl: '/chess-history/medieval-europe.svg',
    imageAlt: 'Illustration representing medieval European chess',
  },
  {
    period: 'c. 1475 CE',
    title: 'Birth of modern chess movement',
    summary: 'A major rules revolution in Europe transforms chess into a faster tactical game.',
    ruleChange: 'Queen gains full power, bishop gains long diagonals, and modern checkmating attacks become central.',
    imageUrl: '/chess-history/modern-rules.svg',
    imageAlt: 'Illustration representing the modern rules revolution',
  },
  {
    period: '1737 CE',
    title: 'Foundations of modern strategy',
    summary: 'François-André Danican Philidor publishes influential ideas emphasizing pawn structure and long-term planning.',
    ruleChange: 'Strategic doctrine expands beyond tactics: “Pawns are the soul of chess.”',
    imageUrl: '/chess-history/philidor.svg',
    imageAlt: 'Illustration representing Philidor and strategic theory',
  },
  {
    period: '1851 CE',
    title: 'First international tournament era',
    summary: 'London hosts the first major international tournament, launching organized competitive chess globally.',
    ruleChange: 'Tournament standards, opening theory growth, and broader publication of games.',
    imageUrl: '/chess-history/london-1851.svg',
    imageAlt: 'Illustration representing the London 1851 tournament',
  },
  {
    period: '1886 CE',
    title: 'Official World Championship begins',
    summary: 'Wilhelm Steinitz and Johannes Zukertort play the first recognized world championship match.',
    ruleChange: 'A formal world-title lineage starts, shaping elite match play tradition.',
    imageUrl: '/chess-history/world-championship.svg',
    imageAlt: 'Illustration representing the start of world championship play',
  },
  {
    period: '1997 CE',
    title: 'Deep Blue defeats Kasparov',
    summary: 'IBM’s Deep Blue beats reigning world champion Garry Kasparov in a match, marking a milestone in computer chess.',
    ruleChange: 'Engine-assisted preparation becomes a permanent part of high-level chess.',
    imageUrl: '/chess-history/deep-blue.svg',
    imageAlt: 'Illustration representing the Deep Blue versus Kasparov milestone',
  },
  {
    period: '2017–present',
    title: 'Neural-network engine age',
    summary: 'AlphaZero-inspired engines and modern neural analysis influence how players study strategy and creativity.',
    ruleChange: 'Training shifts toward engine-guided pattern learning and deeper positional understanding.',
    imageUrl: '/chess-history/neural-era.svg',
    imageAlt: 'Illustration representing the modern neural engine era',
  },
]

function lessonSquareStyles(squares: string[]): Record<string, React.CSSProperties> {
  return squares.reduce<Record<string, React.CSSProperties>>((acc, square) => {
    acc[square] = { background: 'radial-gradient(circle, rgba(59,130,246,0.45) 30%, transparent 32%)' }
    return acc
  }, {})
}

function buildFenFrames(startFen: string, sanMoves: string[]): string[] {
  const chess = new Chess(startFen)
  const frames: string[] = [startFen]
  for (const san of sanMoves) {
    try {
      const played = chess.move(san)
      if (!played) break
      frames.push(chess.fen())
    } catch {
      break
    }
  }
  return frames
}

const NOTATION_GUIDE_ROWS: NotationGuideRow[] = [
  { algebraic: 'e4', descriptive: 'P-K4', meaning: 'Pawn goes to e4 (King-file 4th rank).' },
  { algebraic: 'Nf3', descriptive: 'N-KB3', meaning: 'Knight develops to f3 (King-Bishop 3rd rank).' },
  { algebraic: 'Bb5+', descriptive: 'B-N5+', meaning: 'Bishop to b5 giving check.' },
  { algebraic: 'O-O', descriptive: 'Castles KR', meaning: 'King-side castling.' },
  { algebraic: 'O-O-O', descriptive: 'Castles QR', meaning: 'Queen-side castling.' },
  { algebraic: 'exd5', descriptive: 'PxQ4', meaning: 'Pawn from e-file captures on d5.' },
]

const NOTATION_LINE_MOVES: NotationLineMove[] = [
  { san: 'e4', descriptive: 'P-K4', explanation: 'White claims central space with a two-square pawn advance.', from: 'e2', to: 'e4', focusSquares: ['e2', 'e4'] },
  { san: 'e5', descriptive: 'P-K4', explanation: 'Black mirrors to contest the center.', from: 'e7', to: 'e5', focusSquares: ['e7', 'e5'] },
  { san: 'Nf3', descriptive: 'N-KB3', explanation: 'White develops and attacks e5.', from: 'g1', to: 'f3', focusSquares: ['g1', 'f3', 'e5'] },
  { san: 'Nc6', descriptive: 'N-QB3', explanation: 'Black develops and protects e5.', from: 'b8', to: 'c6', focusSquares: ['b8', 'c6', 'e5'] },
  { san: 'Bc4', descriptive: 'B-B4', explanation: 'White targets f7, a common tactical focal point.', from: 'f1', to: 'c4', focusSquares: ['f1', 'c4', 'f7'] },
  { san: 'Bc5', descriptive: 'B-B4', explanation: 'Black copies development and eyes f2.', from: 'f8', to: 'c5', focusSquares: ['f8', 'c5', 'f2'] },
  { san: 'c3', descriptive: 'P-QB3', explanation: 'White prepares d4 to challenge the center.', from: 'c2', to: 'c3', focusSquares: ['c2', 'c3', 'd4'] },
  { san: 'Nf6', descriptive: 'N-KB3', explanation: 'Black develops with pressure on e4.', from: 'g8', to: 'f6', focusSquares: ['g8', 'f6', 'e4'] },
  { san: 'd4', descriptive: 'P-Q4', explanation: 'White strikes the center and opens lines.', from: 'd2', to: 'd4', focusSquares: ['d2', 'd4', 'e5'] },
  { san: 'exd4', descriptive: 'PxQ4', explanation: 'Black captures to reduce white center space.', from: 'e5', to: 'd4', focusSquares: ['e5', 'd4'] },
  { san: 'cxd4', descriptive: 'PxQ4', explanation: 'White recaptures and restores a strong center.', from: 'c3', to: 'd4', focusSquares: ['c3', 'd4'] },
]

const NOTATION_LINE_FRAMES = buildFenFrames('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', NOTATION_LINE_MOVES.map((m) => m.san))

const ATTACK_PATTERNS: TacticalPattern[] = [
  {
    name: 'Pin',
    category: 'Tactic',
    explanation: 'A pinned piece cannot move without exposing a more valuable piece.',
    teachingNote: 'Bishop pins the knight to the queen. If the knight moves, bishop wins the queen.',
    san: 'Bg5, ...Ne4, Bxd8',
    descriptive: 'B-N5, ...N-K4, BxQ',
    frames: [
      'r2q2k1/ppp2ppp/5n2/3p4/3P4/4B3/PPP2PPP/4R1K1 w - - 0 1',
      'r2q2k1/ppp2ppp/5n2/3p2B1/3P4/8/PPP2PPP/4R1K1 b - - 0 1',
      'r2q2k1/ppp2ppp/8/3p2B1/3Pn3/8/PPP2PPP/4R1K1 w - - 0 2',
      'r2B2k1/ppp2ppp/8/3p4/3Pn3/8/PPP2PPP/4R1K1 b - - 0 2',
    ],
    highlightSquares: ['g5', 'f6', 'd8', 'e4'],
    frameHighlights: [
      ['e3', 'f6', 'd8'],
      ['g5', 'f6', 'd8'],
      ['g5', 'e4', 'd8'],
      ['g5', 'd8'],
    ],
    frameArrows: [
      [['e3', 'g5']],
      [['g5', 'f6'], ['f6', 'd8']],
      [['f6', 'e4'], ['g5', 'd8']],
      [['g5', 'd8']],
    ],
    frameLabels: ['Prepared position', 'Pin created', 'Pinned knight moves', 'Bishop captures queen'],
  },
  {
    name: 'Discovered attack',
    category: 'Tactic',
    explanation: 'One piece moves, revealing an attack by a piece behind it.',
    teachingNote: 'From a game-like middlegame: knight checks the king and uncovers bishop attack on the queen.',
    san: 'Nf7+, Bxg7',
    descriptive: 'N-KB7+, BxQ',
    frames: [
      'r6k/6q1/3p4/4N3/8/2B2N2/PP3PPP/R5K1 w - - 0 1',
      'r6k/5Nq1/3p4/8/8/2B2N2/PP3PPP/R5K1 b - - 0 1',
      'r6k/5NB1/3p4/8/8/5N2/PP3PPP/R5K1 b - - 0 1',
    ],
    highlightSquares: ['c3', 'e5', 'f7', 'g7', 'h8'],
    frameHighlights: [
      ['c3', 'e5', 'g7', 'h8'],
      ['f7', 'h8', 'g7', 'c3'],
      ['g7'],
    ],
    frameArrows: [
      [['c3', 'g7'], ['e5', 'f7']],
      [['e5', 'f7'], ['c3', 'g7']],
      [['c3', 'g7']],
    ],
    frameLabels: ['Prepared position', 'Knight check + discovered line', 'Bishop captures queen'],
  },
  {
    name: 'Fork',
    category: 'Tactic',
    explanation: 'One move attacks two or more targets at once.',
    teachingNote: 'Knight checks the king and then wins material by taking the rook.',
    san: 'Nc7+, ...Kd8, Nxa8',
    descriptive: 'N-QB7+, ...K-Q1, NxR',
    frames: [
      'r3k2r/pp1n1ppp/2p5/1N1p4/3P4/2P5/PP3PPP/R3K2R w KQkq - 0 1',
      'r3k2r/ppNn1ppp/2p5/3p4/3P4/2P5/PP3PPP/R3K2R b KQkq - 1 1',
      'N2k3r/pp1n1ppp/2p5/3p4/3P4/2P5/PP3PPP/R3K2R b KQ - 0 2',
    ],
    highlightSquares: ['b5', 'c7', 'e8', 'a8'],
    frameHighlights: [
      ['b5', 'c7', 'a8', 'e8'],
      ['c7', 'e8', 'a8'],
      ['a8'],
    ],
    frameArrows: [
      [['b5', 'c7']],
      [['c7', 'e8'], ['c7', 'a8']],
      [['c7', 'a8']],
    ],
    frameLabels: ['Prepared position', 'Fork check', 'Knight captures rook'],
  },
  {
    name: 'Skewer',
    category: 'Tactic',
    explanation: 'A long-range piece attacks a valuable piece, forcing it to move and exposing a less valuable piece behind it.',
    teachingNote: 'Rook skewers king and queen on the e-file; after king moves, rook wins the queen.',
    san: 'Re1+, ...Kf6, Rxe8',
    descriptive: 'R-K1+, ...K-B6, RxQ',
    frames: [
      '4q3/4k3/3p4/8/2B5/8/5PPP/5RK1 w - - 0 1',
      '4q3/4k3/3p4/8/2B5/8/5PPP/4R1K1 b - - 0 1',
      '4q3/8/3p1k2/8/2B5/8/5PPP/4R1K1 w - - 1 2',
      '4R3/8/3p1k2/8/2B5/8/5PPP/6K1 b - - 0 2',
    ],
    highlightSquares: ['f1', 'e1', 'e7', 'e8', 'f6'],
    frameHighlights: [
      ['f1', 'e7', 'e8'],
      ['e1', 'e7', 'e8'],
      ['e1', 'f6', 'e8'],
      ['e8'],
    ],
    frameArrows: [
      [['f1', 'e1']],
      [['e1', 'e7'], ['e7', 'e8']],
      [['e7', 'f6'], ['e1', 'e8']],
      [['e1', 'e8']],
    ],
    frameLabels: ['Prepared position', 'Skewer check', 'King moves', 'Rook captures queen'],
  },
]

const DISCOVERED_CHECK_PATTERN: TacticalPattern = {
  name: 'Discovered check',
  category: 'Tactic',
  explanation: 'A moved piece reveals an attack on the king from a piece behind it.',
  teachingNote: 'Bishop moves off the e-file and the rook behind it gives check to the king on e8.',
  san: 'Bb5+',
  descriptive: 'B-N5+',
  frames: buildFenFrames('4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1', ['Bb5+']),
  highlightSquares: ['e1', 'e8', 'e2', 'b5'],
  frameArrows: [[['e2', 'b5'], ['e1', 'e8']], [['e1', 'e8']]],
  frameLabels: ['Setup', 'Discovered check delivered'],
}

const LESSON_SECTIONS: Array<{ id: LessonSection; label: string }> = [
  { id: 'pieces', label: '1) Pieces & movement' },
  { id: 'board-notation', label: '2) Board & notation' },
  { id: 'attacks', label: '3) Attacks' },
  { id: 'discovered-check', label: '4) Discovered check' },
]

const RANK_REFERENCE: string[] = ['1', '2', '3', '4', '5', '6', '7', '8']
const FILE_REFERENCE: string[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANK_DEMO_SQUARES: string[] = ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2']
const FILE_DEMO_SQUARES: string[] = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8']
const DEFAULT_CHESS_STORY_PDF_URL = '/chess-story/architect-of-squares.pdf'
const CHESS_STORY_PDF_URL = String(import.meta.env.VITE_CHESS_STORY_PDF_URL || DEFAULT_CHESS_STORY_PDF_URL).trim() || DEFAULT_CHESS_STORY_PDF_URL
const CHESS_STORY_TTS_VOICE = 'shimmer'
const STORY_MANUAL_NARRATION_STORAGE_KEY = 'chess-story-manual-narration'
const STORY_AUDIO_SLUG = 'architect-of-squares'
const NARRATION_FALLBACK_WORDS_PER_SECOND = 2.7
const STORY_DIRECTOR_SYNC_INTERVAL_MS = 250

if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
}

function base64ToBlobUrl(base64Value: string): string {
  const binaryString = atob(base64Value)
  const bytes = new Uint8Array(binaryString.length)
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }
  const audioBlob = new Blob([bytes], { type: 'audio/mpeg' })
  return URL.createObjectURL(audioBlob)
}

async function getStoryPdfPreflightError(pdfUrl: string): Promise<string | null> {
  try {
    let response = await fetch(pdfUrl, { method: 'HEAD', cache: 'no-store' })
    if (response.status === 405 || response.status === 501) {
      response = await fetch(pdfUrl, { method: 'GET', cache: 'no-store' })
    }

    if (!response.ok) {
      return `Story PDF is not reachable (${response.status}). Verify VITE_CHESS_STORY_PDF_URL or deploy the file at ${pdfUrl}.`
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html')) {
      return `Story PDF URL returned HTML instead of PDF (${pdfUrl}). Check deploy rewrites/static hosting for this file.`
    }

    if (contentType && !contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
      return `Story PDF URL returned unexpected content type (${contentType}). Expected application/pdf at ${pdfUrl}.`
    }

    return null
  } catch {
    // Network/CORS probe failures can be inconclusive; defer to pdf.js loader for final verdict.
    return null
  }
}

function getHighlightStyle(tone: StoryHighlightTone | undefined): React.CSSProperties {
  const colorByTone: Record<StoryHighlightTone, string> = {
    yellow: 'rgba(250, 204, 21, 0.62)',
    blue: 'rgba(59, 130, 246, 0.62)',
    royal: 'rgba(168, 85, 247, 0.62)',
    red: 'rgba(239, 68, 68, 0.62)',
  }

  const fill = colorByTone[tone || 'yellow']
  return {
    background: `radial-gradient(circle, ${fill} 32%, transparent 34%)`,
    animation: 'shimmer 1.35s ease-in-out infinite',
  }
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const totalSeconds = Math.floor(seconds)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function getSeekSecondsForWordIndex(
  wordIndex: number,
  totalWords: number,
  audioDurationSeconds: number,
  preRollSeconds = 0.08,
): number | null {
  if (!Number.isFinite(wordIndex) || !Number.isFinite(totalWords) || totalWords <= 0) return null
  if (!Number.isFinite(audioDurationSeconds) || audioDurationSeconds <= 0) return null

  const clampedWordIndex = Math.min(totalWords - 1, Math.max(0, Math.floor(wordIndex)))
  const targetSeconds = (clampedWordIndex / totalWords) * audioDurationSeconds
  return Math.max(0, targetSeconds - preRollSeconds)
}

function splitManualNarrationIntoPages(rawNarration: string): string[] {
  return rawNarration
    .split(/\n\s*---+\s*\n/g)
    .map((pageText) => pageText.trim())
    .filter((pageText) => pageText.length > 0)
}

type NarrationSource = 'pdf-extracted' | 'manual-page' | 'manual-fallback' | 'none'

type NarrationResolution = {
  text: string
  source: NarrationSource
}

type PdfTextOverlayItem = {
  key: string
  text: string
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  startWordIndex: number
  endWordIndex: number
}

function resolveNarrationForPage(pageNumber: number, extractedText: string, manualNarrationPages: string[]): NarrationResolution {
  const normalizedExtractedText = extractedText.replace(/\s+/g, ' ').trim()
  if (normalizedExtractedText.length > 0) {
    return {
      text: normalizedExtractedText,
      source: 'pdf-extracted',
    }
  }

  const exactPageManualText = manualNarrationPages[pageNumber - 1]
  if (exactPageManualText && exactPageManualText.length > 0) {
    return {
      text: exactPageManualText,
      source: 'manual-page',
    }
  }

  const firstManualText = manualNarrationPages[0]
  if (firstManualText && firstManualText.length > 0) {
    return {
      text: firstManualText,
      source: 'manual-fallback',
    }
  }

  return {
    text: '',
    source: 'none',
  }
}

function narrationSourceLabel(source: NarrationSource): string {
  if (source === 'pdf-extracted') return 'PDF extracted text'
  if (source === 'manual-page') return 'Manual narration (matching page)'
  if (source === 'manual-fallback') return 'Manual narration (first block fallback)'
  return 'No narration source'
}

function isUciLikeMove(move: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(move.trim())
}

function playScriptMove(chess: Chess, rawMove: string): boolean {
  const normalized = rawMove.trim()
  if (!normalized) return false

  if (isUciLikeMove(normalized)) {
    const from = normalized.slice(0, 2) as Square
    const to = normalized.slice(2, 4) as Square
    const promotionRaw = normalized.slice(4, 5).toLowerCase()
    const promotion = promotionRaw && ['q', 'r', 'b', 'n'].includes(promotionRaw)
      ? (promotionRaw as PromotionPiece)
      : undefined

    const moveResult = chess.move({ from, to, promotion })
    return Boolean(moveResult)
  }

  const moveResult = chess.move(normalized)
  return Boolean(moveResult)
}

type DirectorResolvedState = {
  chess: Chess
  styles: Record<string, React.CSSProperties>
  label: string | null
  lastIndex: number
}

function resolveDirectorStateAtTime(actions: StoryDirectorAction[], timeSeconds: number): DirectorResolvedState {
  let chess = new Chess()
  let styles: Record<string, React.CSSProperties> = {}
  let label: string | null = null
  let lastIndex = -1

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (action.timestamp > timeSeconds) break

    if (action.type === 'BOARD_STATE') {
      try {
        chess = new Chess(action.fen)
        styles = {}
      } catch {
        // Ignore invalid FEN and continue.
      }
    }

    if (action.type === 'MOVE') {
      playScriptMove(chess, action.move)
    }

    if (action.type === 'HIGHLIGHT') {
      styles = action.squares.reduce<Record<string, React.CSSProperties>>((accumulator, square) => {
        accumulator[square] = getHighlightStyle(action.tone)
        return accumulator
      }, {})
    }

    label = action.label
    lastIndex = index
  }

  return {
    chess,
    styles,
    label,
    lastIndex,
  }
}

function ChessStoryModal({
  open,
  onClose,
  pdfUrl,
}: {
  open: boolean
  onClose: () => void
  pdfUrl: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageContainerRef = useRef<HTMLDivElement | null>(null)
  const narrationTokenRef = useRef(0)
  const pageTextCacheRef = useRef<Map<number, string>>(new Map())
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioObjectUrlRef = useRef<string | null>(null)
  const storyChessRef = useRef(new Chess())
  const pageActionsRef = useRef<StoryDirectorAction[]>([])
  const lastTriggeredActionIndexRef = useRef<number>(-1)
  const lastDirectorSyncAtRef = useRef<number>(0)
  const lastAudioTimeRef = useRef<number>(0)
  const preservePausedAudioRef = useRef(false)
  const pausedAudioPageRef = useRef<number | null>(null)

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [isNarrating, setIsNarrating] = useState(false)
  const [autoTurnPages, setAutoTurnPages] = useState(true)
  const [manualNarration, setManualNarration] = useState('')
  const [audioSetupWarnings, setAudioSetupWarnings] = useState<string[]>([])
  const [boardPosition, setBoardPosition] = useState(() => new Chess().fen())
  const [customSquareStyles, setCustomSquareStyles] = useState<Record<string, React.CSSProperties>>({})
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [activeNarrationText, setActiveNarrationText] = useState('')
  const [activeNarrationSource, setActiveNarrationSource] = useState<NarrationSource>('none')
  const [pageTextOverlayItems, setPageTextOverlayItems] = useState<PdfTextOverlayItem[]>([])
  const [renderedPageSize, setRenderedPageSize] = useState({ width: 0, height: 0 })
  const [hasExtractablePdfText, setHasExtractablePdfText] = useState<boolean | null>(null)

  const manualNarrationPages = useMemo(() => splitManualNarrationIntoPages(manualNarration), [manualNarration])
  const narrationWords = useMemo(
    () => activeNarrationText.split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 0),
    [activeNarrationText],
  )
  const activeNarrationWordIndex = useMemo(() => {
    if (!isNarrating || narrationWords.length === 0) return -1

    if (audioDuration > 0 && Number.isFinite(audioDuration)) {
      const progress = Math.min(1, Math.max(0, audioCurrentTime / audioDuration))
      return Math.min(narrationWords.length - 1, Math.floor(progress * narrationWords.length))
    }

    const fallbackIndex = Math.floor(Math.max(0, audioCurrentTime) * NARRATION_FALLBACK_WORDS_PER_SECOND)
    return Math.min(narrationWords.length - 1, fallbackIndex)
  }, [isNarrating, audioCurrentTime, audioDuration, narrationWords.length])
  const shouldHighlightOnPdf = activeNarrationSource === 'pdf-extracted' && activeNarrationWordIndex >= 0

  const seekNarrationToWordIndex = useCallback((wordIndex: number) => {
    const activeAudio = activeAudioRef.current
    if (!activeAudio) return

    const resolvedDuration = Number.isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : Number.isFinite(activeAudio.duration) && activeAudio.duration > 0
        ? activeAudio.duration
        : 0

    const seekSeconds = getSeekSecondsForWordIndex(wordIndex, narrationWords.length, resolvedDuration)
    if (seekSeconds === null) return

    const wasPaused = activeAudio.paused
    activeAudio.currentTime = seekSeconds
    setAudioCurrentTime(seekSeconds)

    if (!wasPaused && isNarrating) {
      void activeAudio.play().catch(() => undefined)
    }
  }, [audioDuration, isNarrating, narrationWords.length])

  const stopActiveAudio = useCallback(() => {
    const activeAudio = activeAudioRef.current
    if (activeAudio) {
      activeAudio.onended = null
      activeAudio.onerror = null
      activeAudio.pause()
      activeAudio.src = ''
      activeAudioRef.current = null
    }

    if (activeAudioObjectUrlRef.current) {
      URL.revokeObjectURL(activeAudioObjectUrlRef.current)
      activeAudioObjectUrlRef.current = null
    }
  }, [])

  const stopNarration = useCallback(() => {
    preservePausedAudioRef.current = false
    pausedAudioPageRef.current = null
    setIsNarrating(false)
    setAudioCurrentTime(0)
    setAudioDuration(0)
    setActiveNarrationText('')
    setActiveNarrationSource('none')
    stopActiveAudio()
  }, [stopActiveAudio])

  const handleNarrationToggle = useCallback(() => {
    if (isNarrating) {
      const activeAudio = activeAudioRef.current
      if (activeAudio) {
        preservePausedAudioRef.current = true
        pausedAudioPageRef.current = currentPage
        activeAudio.pause()
        setAudioCurrentTime(activeAudio.currentTime)
      }
      setIsNarrating(false)
      return
    }

    setIsNarrating(true)
  }, [isNarrating, currentPage])

  const resetDirectorForPage = useCallback((pageNumber: number) => {
    const actions = createDirectorScriptForPage(pageNumber)
    pageActionsRef.current = actions
    lastTriggeredActionIndexRef.current = -1
    lastDirectorSyncAtRef.current = 0
    lastAudioTimeRef.current = 0
    setCustomSquareStyles({})
    setActiveActionLabel(null)
    setAudioCurrentTime(0)
    setAudioDuration(0)

    const firstBoardState = actions.find((action) => action.type === 'BOARD_STATE')
    const freshChess = firstBoardState?.type === 'BOARD_STATE'
      ? new Chess(firstBoardState.fen)
      : new Chess()

    storyChessRef.current = freshChess
    setBoardPosition(freshChess.fen())
  }, [])

  const getPageText = useCallback(async (pageNumber: number): Promise<string> => {
    if (!pdfDocument) return ''
    if (pageTextCacheRef.current.has(pageNumber)) {
      return pageTextCacheRef.current.get(pageNumber) || ''
    }

    const page = await pdfDocument.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')

    pageTextCacheRef.current.set(pageNumber, text)
    return text
  }, [pdfDocument])

  const getNarrationForPage = useCallback(async (pageNumber: number): Promise<NarrationResolution> => {
    const extractedText = await getPageText(pageNumber)
    return resolveNarrationForPage(pageNumber, extractedText, manualNarrationPages)
  }, [getPageText, manualNarrationPages])

  const findNarrationStartingAtPage = useCallback(async (pageNumber: number): Promise<{ pageNumber: number; narration: NarrationResolution }> => {
    const currentPageNarration = await getNarrationForPage(pageNumber)
    if (currentPageNarration.text.length > 0 || pageNumber >= totalPages) {
      return {
        pageNumber,
        narration: currentPageNarration,
      }
    }

    for (let candidatePage = pageNumber + 1; candidatePage <= totalPages; candidatePage += 1) {
      const candidateNarration = await getNarrationForPage(candidatePage)
      if (candidateNarration.source === 'pdf-extracted' && candidateNarration.text.length > 0) {
        return {
          pageNumber: candidatePage,
          narration: candidateNarration,
        }
      }
    }

    return {
      pageNumber,
      narration: currentPageNarration,
    }
  }, [getNarrationForPage, totalPages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedNarration = window.localStorage.getItem(STORY_MANUAL_NARRATION_STORAGE_KEY)
    if (savedNarration) {
      setManualNarration(savedNarration)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!manualNarration.trim()) {
      window.localStorage.removeItem(STORY_MANUAL_NARRATION_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORY_MANUAL_NARRATION_STORAGE_KEY, manualNarration)
  }, [manualNarration])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void preloadStoryAudioManifest(STORY_AUDIO_SLUG).catch(() => {
      // Manifest preloading is opportunistic; runtime ensure fallback remains authoritative.
    })

    void getStoryAudioSetupStatus()
      .then((status) => {
        if (cancelled) return
        setAudioSetupWarnings(status.warnings)
      })
      .catch((error) => {
        if (cancelled) return
        setAudioSetupWarnings([error instanceof Error ? error.message : 'Unable to verify story-audio setup'])
      })

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (pausedAudioPageRef.current != null && pausedAudioPageRef.current !== currentPage) {
      preservePausedAudioRef.current = false
      pausedAudioPageRef.current = null
      stopActiveAudio()
    }
    resetDirectorForPage(currentPage)
  }, [open, currentPage, resetDirectorForPage, stopActiveAudio])

  useEffect(() => {
    if (!open) {
      stopNarration()
      setPdfDocument(null)
      setLoadError(null)
      setCurrentPage(1)
      setTotalPages(1)
      resetDirectorForPage(1)
      return
    }

    let cancelled = false
    setIsLoadingDocument(true)
    setLoadError(null)
    setCurrentPage(1)
    setTotalPages(1)
    setHasExtractablePdfText(null)
    setPageTextOverlayItems([])
    setRenderedPageSize({ width: 0, height: 0 })
    pageTextCacheRef.current.clear()

    let loadingTask: ReturnType<typeof getDocument> | null = null

    void (async () => {
      const preflightError = await getStoryPdfPreflightError(pdfUrl)
      if (cancelled) return
      if (preflightError) {
        setLoadError(preflightError)
        setIsLoadingDocument(false)
        return
      }

      loadingTask = getDocument({ url: pdfUrl })

      try {
        const documentProxy = await loadingTask.promise
        if (cancelled) return
        setPdfDocument(documentProxy)
        setTotalPages(Math.max(1, documentProxy.numPages || 1))
      } catch {
        if (cancelled) return
        setLoadError(`Unable to load story PDF from ${pdfUrl}. Check VITE_CHESS_STORY_PDF_URL and static hosting.`)
      } finally {
        if (cancelled) return
        setIsLoadingDocument(false)
      }
    })()

    return () => {
      cancelled = true
      try {
        loadingTask?.destroy()
      } catch {}
      stopNarration()
    }
  }, [open, pdfUrl, stopNarration, resetDirectorForPage])

  useEffect(() => {
    if (!open || !pdfDocument) {
      setHasExtractablePdfText(null)
      return
    }

    let cancelled = false

    const detectPdfText = async () => {
      setHasExtractablePdfText(null)

      try {
        const pageCount = Math.max(1, pdfDocument.numPages || 1)
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber)
          if (cancelled) return

          const textContent = await page.getTextContent()
          const text = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()

          if (text.length > 0) {
            setHasExtractablePdfText(true)
            return
          }
        }

        if (!cancelled) {
          setHasExtractablePdfText(false)
        }
      } catch {
        if (!cancelled) {
          setHasExtractablePdfText(false)
        }
      }
    }

    void detectPdfText()

    return () => {
      cancelled = true
    }
  }, [open, pdfDocument])

  useEffect(() => {
    if (!open || !pdfDocument) return
    let cancelled = false

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(currentPage)
        if (cancelled) return

        const canvas = canvasRef.current
        const container = pageContainerRef.current
        if (!canvas || !container) return

        const context = canvas.getContext('2d')
        if (!context) return

        const baseViewport = page.getViewport({ scale: 1 })
        const containerWidth = Math.max(300, container.clientWidth - 16)
        const containerHeight = Math.max(240, container.clientHeight - 16)
        const widthScale = containerWidth / baseViewport.width
        const heightScale = containerHeight / baseViewport.height
        const scale = Math.max(0.2, Math.min(widthScale, heightScale))
        const viewport = page.getViewport({ scale })

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        setRenderedPageSize({ width: canvas.width, height: canvas.height })

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        })
        await renderTask.promise

        try {
          const textContent = await page.getTextContent()
          const viewportAny = viewport as unknown as { convertToViewportPoint?: (x: number, y: number) => number[] }
          let runningWordIndex = 0
          const overlayItems = textContent.items
            .map((item, index) => {
              if (!('str' in item)) return null

              const normalizedText = item.str.replace(/\s+/g, ' ').trim()
              if (!normalizedText) return null

              const words = normalizedText.split(/\s+/).filter((word) => word.length > 0)
              if (words.length === 0) return null

              const transform = Array.isArray((item as { transform?: unknown }).transform)
                ? ((item as { transform: number[] }).transform)
                : null
              const rawX = transform?.[4] ?? 0
              const rawY = transform?.[5] ?? 0

              const convertedPoint = typeof viewportAny.convertToViewportPoint === 'function'
                ? viewportAny.convertToViewportPoint(rawX, rawY)
                : [rawX * scale, rawY * scale]
              const left = Number(convertedPoint[0] ?? 0)
              const baselineY = Number(convertedPoint[1] ?? 0)

              const itemHeight = typeof (item as { height?: unknown }).height === 'number'
                ? Math.abs((item as { height: number }).height * scale)
                : 16
              const widthFromItem = typeof (item as { width?: unknown }).width === 'number'
                ? Math.abs((item as { width: number }).width * scale)
                : 0
              const widthFromText = Math.max(8, normalizedText.length * Math.max(10, itemHeight) * 0.42)
              const width = Math.max(1, widthFromItem || widthFromText)
              const height = Math.max(1, itemHeight)
              const top = Math.max(0, baselineY - height)

              const startWordIndex = runningWordIndex
              const endWordIndex = runningWordIndex + words.length - 1
              runningWordIndex += words.length

              return {
                key: `${currentPage}-${index}-${Math.round(left)}-${Math.round(top)}`,
                text: normalizedText,
                left,
                top,
                width,
                height,
                fontSize: Math.max(10, height),
                startWordIndex,
                endWordIndex,
              } as PdfTextOverlayItem
            })
            .filter((item): item is PdfTextOverlayItem => Boolean(item))

          if (!cancelled) {
            setPageTextOverlayItems(overlayItems)
          }
        } catch (overlayErr) {
          console.warn('[story/text-overlay] Failed to extract text overlay items:', overlayErr)
          if (!cancelled) {
            setPageTextOverlayItems([])
          }
        }
      } catch {
        if (!cancelled) {
          setLoadError('Unable to render this page of the story.')
          setPageTextOverlayItems([])
        }
      }
    }

    void renderPage()
    return () => {
      cancelled = true
    }
  }, [open, pdfDocument, currentPage])

  useEffect(() => {
    if (!open || !isNarrating || !pdfDocument) return

    let cancelled = false
    let removeAudioListeners: (() => void) | null = null
    const narrationToken = narrationTokenRef.current + 1
    narrationTokenRef.current = narrationToken

    const canResumePausedAudio = Boolean(
      activeAudioRef.current
      && preservePausedAudioRef.current
      && pausedAudioPageRef.current === currentPage
      && activeAudioRef.current.src,
    )

    if (!canResumePausedAudio) {
      stopActiveAudio()
      resetDirectorForPage(currentPage)
    }

    preservePausedAudioRef.current = false

    const playPageAudio = async () => {
      const bindAudioEvents = (audio: HTMLAudioElement) => {
        const onEnded = () => {
          if (cancelled || narrationTokenRef.current !== narrationToken) return
          if (!autoTurnPages) return

          if (currentPage >= totalPages) {
            setIsNarrating(false)
            return
          }

          setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))
        }
        const onError = () => {
          if (!cancelled) {
            setIsNarrating(false)
            setLoadError('Audio playback failed for this page.')
          }
        }

        const onSeeked = () => {
          const resolved = resolveDirectorStateAtTime(pageActionsRef.current, audio.currentTime)
          storyChessRef.current = resolved.chess
          setBoardPosition(resolved.chess.fen())
          setCustomSquareStyles(resolved.styles)
          setActiveActionLabel(resolved.label)
          lastTriggeredActionIndexRef.current = resolved.lastIndex
          lastAudioTimeRef.current = audio.currentTime
        }

        const onLoadedMetadata = () => {
          setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
        }

        const onTimeUpdate = () => {
          if (cancelled || narrationTokenRef.current !== narrationToken) return
          const now = Date.now()
          if (now - lastDirectorSyncAtRef.current < STORY_DIRECTOR_SYNC_INTERVAL_MS) return
          lastDirectorSyncAtRef.current = now
          setAudioCurrentTime(audio.currentTime)

          const actions = pageActionsRef.current
          if (!actions.length) return

          if (audio.currentTime + 0.01 < lastAudioTimeRef.current) {
            const resolved = resolveDirectorStateAtTime(actions, audio.currentTime)
            storyChessRef.current = resolved.chess
            setBoardPosition(resolved.chess.fen())
            setCustomSquareStyles(resolved.styles)
            setActiveActionLabel(resolved.label)
            lastTriggeredActionIndexRef.current = resolved.lastIndex
            lastAudioTimeRef.current = audio.currentTime

            if (resolved.lastIndex >= 0) {
              const lastAction = actions[resolved.lastIndex]
              console.log('[story/director] Replayed action after backward seek', {
                label: lastAction.label,
                actionTimestamp: lastAction.timestamp,
                audioTime: Number(audio.currentTime.toFixed(2)),
                page: currentPage,
              })
            }
            return
          }

          for (let index = lastTriggeredActionIndexRef.current + 1; index < actions.length; index += 1) {
            const action = actions[index]
            if (audio.currentTime < action.timestamp) break

            if (action.type === 'MOVE') {
              try {
                const moved = playScriptMove(storyChessRef.current, action.move)
                if (moved) {
                  setBoardPosition(storyChessRef.current.fen())
                }
              } catch {
                // Ignore invalid scripted move and continue.
              }
            }

            if (action.type === 'HIGHLIGHT') {
              const styles = action.squares.reduce<Record<string, React.CSSProperties>>((accumulator, square) => {
                accumulator[square] = getHighlightStyle(action.tone)
                return accumulator
              }, {})
              setCustomSquareStyles(styles)
            }

            if (action.type === 'BOARD_STATE') {
              try {
                const forcedBoard = new Chess(action.fen)
                storyChessRef.current = forcedBoard
                setBoardPosition(forcedBoard.fen())
              } catch {
                // Ignore invalid scripted board state and continue.
              }
            }

            setActiveActionLabel(action.label)
            lastTriggeredActionIndexRef.current = index
            console.log('[story/director] Executed action', {
              label: action.label,
              actionTimestamp: action.timestamp,
              audioTime: Number(audio.currentTime.toFixed(2)),
              page: currentPage,
            })
          }

          lastAudioTimeRef.current = audio.currentTime
        }

        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        audio.addEventListener('loadedmetadata', onLoadedMetadata)
        audio.addEventListener('seeked', onSeeked)
        audio.addEventListener('timeupdate', onTimeUpdate)

        if (Number.isFinite(audio.duration)) {
          setAudioDuration(audio.duration)
        }

        return () => {
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onError)
          audio.removeEventListener('loadedmetadata', onLoadedMetadata)
          audio.removeEventListener('seeked', onSeeked)
          audio.removeEventListener('timeupdate', onTimeUpdate)
        }
      }

      if (canResumePausedAudio && activeAudioRef.current) {
        const audio = activeAudioRef.current
        removeAudioListeners = bindAudioEvents(audio)
        try {
          await audio.play()
        } catch {
          if (!cancelled) {
            setIsNarrating(false)
            setLoadError('Audio playback was blocked. Click play again to continue narration.')
          }
        }
        return
      }

      const narrationResult = await findNarrationStartingAtPage(currentPage)
      if (cancelled || narrationTokenRef.current !== narrationToken) return

      if (narrationResult.pageNumber !== currentPage) {
        setCurrentPage(narrationResult.pageNumber)
        return
      }

      const narration = narrationResult.narration
      const text = narration.text
      if (cancelled || narrationTokenRef.current !== narrationToken) return
      setActiveNarrationSource(narration.source)

      if (!text) {
        setIsNarrating(false)
        setActiveNarrationText('')
        setLoadError('No readable PDF text found. Paste story text below (split pages with ---) to enable narration.')
        return
      }

      setActiveNarrationText(text)
      setLoadError(null)
      let audioSourceUrl = ''
      let createdObjectUrl: string | null = null

      try {
        const ensuredAudio = await ensureStoryAudio({
          storySlug: STORY_AUDIO_SLUG,
          page: currentPage,
          totalPages,
          text,
          voice: CHESS_STORY_TTS_VOICE,
        })

        if (ensuredAudio.audioBase64 && ensuredAudio.audioBase64.length > 0) {
          createdObjectUrl = base64ToBlobUrl(ensuredAudio.audioBase64)
          audioSourceUrl = createdObjectUrl
        } else if (ensuredAudio.url) {
          audioSourceUrl = ensuredAudio.url
        }
      } catch (error) {
        if (cancelled || narrationTokenRef.current !== narrationToken) return
        setIsNarrating(false)
        setLoadError(error instanceof Error ? error.message : 'Failed to generate story audio')
        return
      }

      if (!audioSourceUrl) {
        setIsNarrating(false)
        setLoadError('Unable to resolve a story audio URL for this page.')
        return
      }

      const audio = new Audio(audioSourceUrl)
      activeAudioRef.current = audio
      if (createdObjectUrl) {
        activeAudioObjectUrlRef.current = createdObjectUrl
      }

      removeAudioListeners = bindAudioEvents(audio)

      try {
        await audio.play()
      } catch {
        if (!cancelled) {
          setIsNarrating(false)
          setLoadError('Audio playback was blocked. Click play again to continue narration.')
        }
      }
    }

    void playPageAudio()

    return () => {
      cancelled = true
      removeAudioListeners?.()
      if (preservePausedAudioRef.current && pausedAudioPageRef.current === currentPage) {
        return
      }
      stopActiveAudio()
    }
  }, [
    open,
    isNarrating,
    pdfDocument,
    currentPage,
    totalPages,
    autoTurnPages,
    findNarrationStartingAtPage,
    stopActiveAudio,
    resetDirectorForPage,
  ])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopNarration()
        onClose()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open, onClose, stopNarration])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={() => { stopNarration(); onClose() }} role="dialog" aria-modal="true" aria-label="Chess story modal">
      <div className="flex h-[88vh] w-[92vw] min-h-[460px] min-w-[340px] max-w-[1500px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-700">The Architect of Squares</div>
            <div className="text-xs text-slate-500">Story mode with read-aloud and automatic page turning</div>
          </div>
          <button
            type="button"
            onClick={() => { stopNarration(); onClose() }}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((previousPage) => Math.max(1, previousPage - 1))}
            disabled={currentPage <= 1}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous page
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))}
            disabled={currentPage >= totalPages}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next page
          </button>
          <button
            type="button"
            onClick={handleNarrationToggle}
            disabled={isLoadingDocument || !!loadError || !pdfDocument}
            className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isNarrating ? 'Pause narration' : 'Play narration'}
          </button>
          <button
            type="button"
            onClick={() => setAutoTurnPages((previousState) => !previousState)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {autoTurnPages ? 'Auto-turn: on' : 'Auto-turn: off'}
          </button>
          <span className="text-xs text-slate-500">Page {currentPage}/{totalPages}</span>
          <span className="text-xs text-slate-500">Audio {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}</span>
          <span className="text-xs text-slate-500">Source: {narrationSourceLabel(activeNarrationSource)}</span>
        </div>

        {audioSetupWarnings.length > 0 ? (
          <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <div className="font-semibold">Story audio setup warning</div>
            <ul className="mt-1 list-disc pl-4">
              {audioSetupWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <div className="grid h-full min-h-0 gap-2 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div ref={pageContainerRef} className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
              {isLoadingDocument ? <div className="text-sm text-slate-600">Loading story PDF…</div> : null}
              {loadError ? <div className="text-sm text-red-600">{loadError}</div> : null}
              {!isLoadingDocument && !loadError ? (
                <div className="relative mx-auto block" style={{ width: renderedPageSize.width || undefined, height: renderedPageSize.height || undefined }}>
                  <canvas ref={canvasRef} className="block max-h-full max-w-full" />
                  {pageTextOverlayItems.length > 0 ? (
                    <div className="pointer-events-none absolute inset-0">
                      {pageTextOverlayItems.map((item) => {
                        const isActiveWord = shouldHighlightOnPdf
                          && activeNarrationWordIndex >= item.startWordIndex
                          && activeNarrationWordIndex <= item.endWordIndex

                        const wordsInItem = item.text.split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 0)

                        return (
                          <span
                            key={item.key}
                            data-testid={isActiveWord ? 'story-pdf-highlight-active' : undefined}
                            className={isActiveWord ? 'absolute rounded' : 'absolute'}
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              if (wordsInItem.length <= 1) {
                                seekNarrationToWordIndex(item.startWordIndex)
                                return
                              }

                              const rect = event.currentTarget.getBoundingClientRect()
                              const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
                              const ratio = rect.width > 0 ? relativeX / rect.width : 0
                              const offset = Math.min(wordsInItem.length - 1, Math.max(0, Math.floor(ratio * wordsInItem.length)))
                              const wordIndex = Math.min(item.endWordIndex, item.startWordIndex + offset)
                              seekNarrationToWordIndex(wordIndex)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              seekNarrationToWordIndex(item.startWordIndex)
                            }}
                            style={{
                              left: item.left,
                              top: item.top,
                              width: item.width,
                              height: item.height,
                              display: 'block',
                              fontSize: item.fontSize,
                              lineHeight: 1,
                              color: 'transparent',
                              backgroundColor: isActiveWord ? 'rgba(191, 219, 254, 0.60)' : 'transparent',
                              mixBlendMode: isActiveWord ? 'multiply' : 'normal',
                              boxShadow: isActiveWord ? 'inset 0 -1.5px 0 rgba(59, 130, 246, 0.58)' : 'none',
                              zIndex: isActiveWord ? 2 : 1,
                              whiteSpace: 'pre',
                              pointerEvents: 'auto',
                            }}
                          >
                            {item.text}
                          </span>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="mb-2 text-xs font-semibold text-slate-600">Story board timeline</div>
              <div className="mx-auto w-[240px]">
                <Chessboard
                  id={`story-board-${currentPage}`}
                  position={boardPosition}
                  boardOrientation="white"
                  arePiecesDraggable={false}
                  showBoardNotation={false}
                  customSquareStyles={customSquareStyles}
                  animationDuration={500}
                  boardWidth={240}
                  {...CHESSBOARD_THEME}
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-600">{activeActionLabel ? `Last cue: ${activeActionLabel}` : 'Waiting for cue...'}</div>
            </div>
          </div>
        </div>

        {hasExtractablePdfText === false ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
            <label htmlFor="manual-story-narration" className="mb-1 block text-xs font-semibold text-slate-600">
              Manual narration (for image-only PDFs)
            </label>
            <textarea
              id="manual-story-narration"
              value={manualNarration}
              onChange={(event) => {
                setLoadError(null)
                setManualNarration(event.target.value)
              }}
              rows={3}
              placeholder="Paste story text here. Use a line with --- between pages."
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ChessTutorPanel({
  analysis,
  modelLabel,
  loading,
  error,
  onAnalyze,
}: {
  analysis: ChessTutorAnalysis | null
  modelLabel: string
  loading: boolean
  error: string | null
  onAnalyze: () => void
}) {
  const [activeTab, setActiveTab] = useState<TutorTab>('analyze')
  const [activeLessonIndex, setActiveLessonIndex] = useState(0)
  const [animationFrame, setAnimationFrame] = useState(0)
  const [activeLessonSection, setActiveLessonSection] = useState<LessonSection>('pieces')
  const [notationPly, setNotationPly] = useState(0)
  const [notationAutoplay, setNotationAutoplay] = useState(true)
  const [notationFocus, setNotationFocus] = useState<'rank' | 'file' | 'move'>('rank')
  const [activePatternIndex, setActivePatternIndex] = useState(0)
  const [patternFrame, setPatternFrame] = useState(0)
  const [patternAutoplay, setPatternAutoplay] = useState(true)
  const [discoveredCheckFrame, setDiscoveredCheckFrame] = useState(0)
  const [discoveredCheckAutoplay, setDiscoveredCheckAutoplay] = useState(true)
  const [storyModalOpen, setStoryModalOpen] = useState(false)

  const activeLesson = CHESS_LESSONS[activeLessonIndex]
  const activePattern = ATTACK_PATTERNS[activePatternIndex]
  const activeNotationMove = notationPly > 0 ? NOTATION_LINE_MOVES[notationPly - 1] : null
  const notationFrame = NOTATION_LINE_FRAMES[Math.min(notationPly, NOTATION_LINE_FRAMES.length - 1)]
  const patternCurrentHighlights = activePattern.frameHighlights?.[patternFrame] ?? activePattern.highlightSquares
  const patternCurrentArrows = activePattern.frameArrows?.[patternFrame] ?? []
  const discoveredCheckCurrentArrows = DISCOVERED_CHECK_PATTERN.frameArrows?.[discoveredCheckFrame] ?? []
  const notationTargetSquare: Square = (notationFocus === 'move' && activeNotationMove ? activeNotationMove.to : 'e2') as Square
  const notationTargetFile = notationTargetSquare[0] as string
  const notationTargetRank = notationTargetSquare[1] as string
  const notationTargetFileIndex = FILE_REFERENCE.indexOf(notationTargetFile)
  const notationTargetRankNumber = Number(notationTargetRank)
  const notationTargetX = notationTargetFileIndex >= 0 ? (notationTargetFileIndex + 0.5) * 31.25 : 125
  const notationTargetY = notationTargetRankNumber > 0 ? (8 - notationTargetRankNumber + 0.5) * 31.25 : 125

  const notationBoardHighlights = useMemo(() => {
    if (notationFocus === 'rank') return RANK_DEMO_SQUARES
    if (notationFocus === 'file') return FILE_DEMO_SQUARES
    return activeNotationMove?.focusSquares ?? []
  }, [notationFocus, activeNotationMove])

  useEffect(() => {
    setAnimationFrame(0)
  }, [activeLessonIndex])

  useEffect(() => {
    setPatternFrame(0)
  }, [activePatternIndex])

  useEffect(() => {
    setDiscoveredCheckFrame(0)
  }, [activeLessonSection])

  useEffect(() => {
    if (activeTab !== 'lesson') return
    const timer = window.setInterval(() => {
      setAnimationFrame((prev) => (prev + 1) % activeLesson.frames.length)
    }, 1200)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLesson.frames.length])

  useEffect(() => {
    if (activeTab !== 'lesson' || !notationAutoplay) return
    if (activeLessonSection !== 'board-notation') return
    const timer = window.setInterval(() => {
      setNotationFocus((currentFocus) => {
        if (currentFocus === 'rank') return 'file'
        if (currentFocus === 'file') {
          setNotationPly(1)
          return 'move'
        }

        let completed = false
        setNotationPly((currentPly) => {
          if (currentPly >= NOTATION_LINE_MOVES.length) {
            completed = true
            return 0
          }
          return currentPly + 1
        })
        return completed ? 'rank' : 'move'
      })
    }, 1700)
    return () => window.clearInterval(timer)
  }, [activeTab, notationAutoplay, activeLessonSection])

  useEffect(() => {
    if (activeTab !== 'lesson' || activeLessonSection !== 'attacks' || !patternAutoplay) return
    const timer = window.setInterval(() => {
      setPatternFrame((prev) => (prev + 1) % activePattern.frames.length)
    }, 1600)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLessonSection, patternAutoplay, activePattern.frames.length])

  useEffect(() => {
    if (activeTab !== 'lesson' || activeLessonSection !== 'discovered-check' || !discoveredCheckAutoplay) return
    const timer = window.setInterval(() => {
      setDiscoveredCheckFrame((prev) => (prev + 1) % DISCOVERED_CHECK_PATTERN.frames.length)
    }, 1700)
    return () => window.clearInterval(timer)
  }, [activeTab, activeLessonSection, discoveredCheckAutoplay])

  return (
    <>
      <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:w-[360px] lg:shrink-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">Chess Tutor</div>
        <span className="text-xs text-slate-500">{modelLabel}</span>
      </div>
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="text-xs font-semibold text-slate-600">Tutor Panel</div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('lesson')}
            className={`rounded border px-2 py-1 text-xs font-semibold ${activeTab === 'lesson' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            How to play
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded border px-2 py-1 text-xs font-semibold ${activeTab === 'history' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Chess history
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analyze')}
            className={`rounded border px-2 py-1 text-xs font-semibold ${activeTab === 'analyze' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Analyze game
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-sm">
        {activeTab === 'analyze' ? (
          <>
            <button
              type="button"
              onClick={onAnalyze}
              disabled={loading}
              className="mb-3 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Analyzing…' : 'Analyze game for me'}
            </button>
            {error ? <div className="text-red-600">{error}</div> : null}
            {!error && !analysis && !loading ? <div className="text-slate-500">Press “Analyze game for me” to get a position summary, hints, and focus points.</div> : null}
            {analysis ? (
              <div className="space-y-3 text-slate-700">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Position Summary</div>
                  <p className="mt-1 text-sm">{analysis.positionSummary}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hints</div>
                  <ul className="mt-1 list-disc pl-5">
                    {(analysis.hints.length ? analysis.hints : ['No immediate tactical hints detected.']).map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Focus Points</div>
                  <ul className="mt-1 list-disc pl-5">
                    {(analysis.focusAreas.length ? analysis.focusAreas : ['Improve piece activity and king safety.']).map((focus) => (
                      <li key={focus}>{focus}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </>
        ) : activeTab === 'history' ? (
          <div className="space-y-3 text-slate-700">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chess History Timeline</div>
            <p className="text-sm text-slate-600">Scroll from the earliest mentions of chess through major historical rule and strategy changes.</p>
            <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
              {CHESS_HISTORY_EVENTS.map((event) => (
                <article key={`${event.period}-${event.title}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <img
                    src={event.imageUrl}
                    alt={event.imageAlt}
                    loading="lazy"
                    className="h-28 w-full rounded-md border border-slate-200 object-cover"
                  />
                  <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{event.period}</div>
                  <h4 className="text-sm font-semibold text-slate-700">{event.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{event.summary}</p>
                  <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Key change:</span> {event.ruleChange}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-2 text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">How to play</div>
              <button
                type="button"
                onClick={() => setStoryModalOpen(true)}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Story mode
              </button>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max gap-1">
                {LESSON_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveLessonSection(section.id)}
                    className={`shrink-0 whitespace-nowrap rounded border px-2 py-1 text-xs font-semibold ${activeLessonSection === section.id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-none rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="relative mx-auto w-full max-w-[250px]">
                <Chessboard
                  id={`lesson-main-${activeLessonSection}`}
                  position={
                    activeLessonSection === 'pieces'
                      ? activeLesson.frames[animationFrame]
                      : activeLessonSection === 'board-notation'
                        ? notationFrame
                        : activeLessonSection === 'attacks'
                          ? activePattern.frames[patternFrame]
                          : DISCOVERED_CHECK_PATTERN.frames[discoveredCheckFrame]
                  }
                  boardWidth={250}
                  showBoardNotation
                  arePiecesDraggable={false}
                  customArrows={
                    activeLessonSection === 'attacks'
                      ? patternCurrentArrows
                      : activeLessonSection === 'discovered-check'
                        ? discoveredCheckCurrentArrows
                        : []
                  }
                  customSquareStyles={
                    activeLessonSection === 'pieces'
                      ? lessonSquareStyles(activeLesson.highlightSquares)
                      : activeLessonSection === 'board-notation'
                        ? lessonSquareStyles(notationBoardHighlights)
                        : activeLessonSection === 'attacks'
                          ? lessonSquareStyles(patternCurrentHighlights)
                          : lessonSquareStyles(DISCOVERED_CHECK_PATTERN.highlightSquares)
                  }
                  animationDuration={500}
                />
                {activeLessonSection === 'board-notation' ? (
                  <>
                    <svg className="pointer-events-none absolute left-0 top-0 h-[250px] w-[250px]" viewBox="0 0 250 250" aria-hidden="true">
                      <line x1={notationTargetX} y1={250} x2={notationTargetX} y2={notationTargetY} stroke="rgba(37,99,235,0.85)" strokeWidth="2" />
                      <line x1={0} y1={notationTargetY} x2={notationTargetX} y2={notationTargetY} stroke="rgba(37,99,235,0.85)" strokeWidth="2" />
                      <circle cx={notationTargetX} cy={notationTargetY} r="5" fill="rgba(37,99,235,0.9)" />
                    </svg>
                    <div className="pointer-events-none absolute -left-8 top-0 h-[250px] w-6">
                      {[...RANK_REFERENCE].reverse().map((rank, idx) => (
                        <div key={rank} className="absolute left-0 flex h-[31.25px] w-6 items-center justify-center" style={{ top: `${idx * 31.25}px` }}>
                          <span className={`text-sm font-bold ${rank === notationTargetRank ? 'text-blue-700 [text-shadow:0_0_8px_rgba(37,99,235,0.6)]' : 'text-slate-500'}`}>
                            {rank}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pointer-events-none absolute -bottom-7 left-0 grid w-[250px] grid-cols-8">
                      {FILE_REFERENCE.map((file) => (
                        <div key={file} className="flex items-center justify-center">
                          <span className={`text-sm font-bold ${file === notationTargetFile ? 'text-blue-700 [text-shadow:0_0_8px_rgba(37,99,235,0.6)]' : 'text-slate-500'}`}>
                            {file}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
                {activeLessonSection === 'board-notation' && notationFocus === 'move' && activeNotationMove ? (
                  <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-white/40 bg-slate-900/50 px-3 py-1 text-sm font-semibold text-white">
                    {activeNotationMove.from} → {activeNotationMove.to}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {activeLessonSection === 'pieces' ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pieces & movement</div>
                  <p className="text-xs text-slate-600">These examples use full-board positions from realistic openings/endgames instead of isolated single-piece boards.</p>
                  <div className="overflow-x-auto pb-1">
                    <div className="inline-flex min-w-max gap-1">
                      {CHESS_LESSONS.map((lesson, index) => (
                        <button
                          key={lesson.piece}
                          type="button"
                          onClick={() => setActiveLessonIndex(index)}
                          className={`shrink-0 whitespace-nowrap rounded border px-2 py-1 text-xs font-semibold ${index === activeLessonIndex ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          {lesson.piece}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{activeLesson.piece}</div>
                    <div className="text-xs text-slate-500">Piece value: {activeLesson.value}</div>
                    <p className="mt-1 text-sm">{activeLesson.explanation}</p>
                    <p className="mt-1 text-xs text-slate-500">{activeLesson.movement}</p>
                  </div>
                </div>
              ) : activeLessonSection === 'board-notation' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Board & notation</div>
                    <button
                      type="button"
                      onClick={() => setNotationAutoplay((prev) => !prev)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {notationAutoplay ? 'Pause autoplay' : 'Start autoplay'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => setNotationFocus('rank')}
                      className={`rounded border px-2 py-1 text-xs font-semibold ${notationFocus === 'rank' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Ranks (1–8)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotationFocus('file')}
                      className={`rounded border px-2 py-1 text-xs font-semibold ${notationFocus === 'file' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Files (a–h)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotationFocus('move')}
                      className={`rounded border px-2 py-1 text-xs font-semibold ${notationFocus === 'move' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      Move coordinates
                    </button>
                  </div>
                  {notationFocus === 'rank' ? <p className="text-sm font-semibold text-slate-700">Ranks are the row numbers 1–8. Follow the glowing number on the board edge to the target square.</p> : null}
                  {notationFocus === 'file' ? <p className="text-sm font-semibold text-slate-700">Files are the column letters a–h. Follow the glowing letter on the board edge to the target square.</p> : null}
                  {notationFocus === 'move' ? <p className="text-sm font-semibold text-slate-700">When a move appears, read source → target (example: e2 → e4) and trace the guide line to the square.</p> : null}
                  <p className="text-xs text-slate-600">Algebraic notation names the destination square. Older descriptive notation uses names like K, QB, and KN files.</p>
                  <div className="overflow-hidden rounded border border-slate-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-2 py-1 font-semibold">Algebraic</th>
                          <th className="px-2 py-1 font-semibold">Older descriptive</th>
                          <th className="px-2 py-1 font-semibold">Meaning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {NOTATION_GUIDE_ROWS.map((row) => (
                          <tr key={`${row.algebraic}-${row.descriptive}`} className="border-t border-slate-100 text-slate-700">
                            <td className="px-2 py-1 font-semibold">{row.algebraic}</td>
                            <td className="px-2 py-1">{row.descriptive}</td>
                            <td className="px-2 py-1 text-slate-600">{row.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNotationPly((prev) => Math.max(0, prev - 1))}
                      disabled={notationPly === 0}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous move
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotationPly((prev) => Math.min(NOTATION_LINE_MOVES.length, prev + 1))}
                      disabled={notationPly === NOTATION_LINE_MOVES.length}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next move
                    </button>
                    <span className="text-[11px] text-slate-500">Move {notationPly}/{NOTATION_LINE_MOVES.length}</span>
                  </div>
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {NOTATION_LINE_MOVES.map((move, index) => {
                      const isActive = index + 1 === notationPly
                      const isPast = index + 1 < notationPly
                      return (
                        <button
                          key={`${index + 1}-${move.san}`}
                          type="button"
                          onClick={() => setNotationPly(index + 1)}
                          aria-current={isActive ? 'step' : undefined}
                          className={`w-full rounded border px-2 py-1 text-left text-xs ${isActive ? 'border-blue-300 bg-blue-50 text-blue-700' : isPast ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          <span className="font-semibold">{index + 1}. {move.san}</span>
                          <span className="ml-2 text-[11px]">({move.descriptive})</span>
                          <div className="mt-0.5 text-[11px] text-slate-500">{move.explanation}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : activeLessonSection === 'attacks' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attacks (fork, discovered, pinned, etc.)</div>
                    <button
                      type="button"
                      onClick={() => setPatternAutoplay((prev) => !prev)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {patternAutoplay ? 'Pause autoplay' : 'Start autoplay'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">Use the pattern buttons to cycle through common tactical motifs.</p>
                  <div className="overflow-x-auto pb-1">
                    <div className="inline-flex min-w-max gap-1">
                      {ATTACK_PATTERNS.map((pattern, index) => (
                        <button
                          key={pattern.name}
                          type="button"
                          onClick={() => setActivePatternIndex(index)}
                          className={`shrink-0 whitespace-nowrap rounded border px-2 py-1 text-xs font-semibold ${index === activePatternIndex ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          {pattern.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPatternFrame(0)}
                      disabled={patternFrame === 0}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Show setup
                    </button>
                    <button
                      type="button"
                      onClick={() => setPatternFrame(activePattern.frames.length - 1)}
                      disabled={patternFrame === activePattern.frames.length - 1}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Show key idea
                    </button>
                    <span className="text-[11px] text-slate-500">Frame {patternFrame + 1}/{activePattern.frames.length}</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-semibold text-slate-700">{activePattern.name}</div>
                    <p className="mt-1 text-[11px] text-slate-500">{activePattern.frameLabels?.[patternFrame] ?? `Frame ${patternFrame + 1}`}</p>
                    <p className="mt-1 text-xs text-slate-600">{activePattern.explanation}</p>
                    <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">What to notice:</span> {activePattern.teachingNote}</p>
                    <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Notation:</span> {activePattern.san} | {activePattern.descriptive}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Discovered check</div>
                    <button
                      type="button"
                      onClick={() => setDiscoveredCheckAutoplay((prev) => !prev)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {discoveredCheckAutoplay ? 'Pause autoplay' : 'Start autoplay'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">This is taught right after discovered attacks so students can see the same idea now targeting the king.</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscoveredCheckFrame(0)}
                      disabled={discoveredCheckFrame === 0}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Show setup
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscoveredCheckFrame(DISCOVERED_CHECK_PATTERN.frames.length - 1)}
                      disabled={discoveredCheckFrame === DISCOVERED_CHECK_PATTERN.frames.length - 1}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Show discovered check
                    </button>
                    <span className="text-[11px] text-slate-500">Frame {discoveredCheckFrame + 1}/{DISCOVERED_CHECK_PATTERN.frames.length}</span>
                  </div>
                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                    <div className="text-xs font-semibold text-slate-700">{DISCOVERED_CHECK_PATTERN.name}</div>
                    <p className="mt-1 text-[11px] text-slate-500">{DISCOVERED_CHECK_PATTERN.frameLabels?.[discoveredCheckFrame] ?? `Frame ${discoveredCheckFrame + 1}`}</p>
                    <p className="mt-1 text-xs text-slate-600">{DISCOVERED_CHECK_PATTERN.explanation}</p>
                    <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">What to notice:</span> {DISCOVERED_CHECK_PATTERN.teachingNote}</p>
                    <p className="mt-1 text-xs text-slate-600"><span className="font-semibold">Notation:</span> {DISCOVERED_CHECK_PATTERN.san} | {DISCOVERED_CHECK_PATTERN.descriptive}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </aside>
      <ChessStoryModal open={storyModalOpen} onClose={() => setStoryModalOpen(false)} pdfUrl={CHESS_STORY_PDF_URL} />
    </>
  )
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const CHESSBOARD_MAX_SIZE = 720

const CHESSBOARD_THEME = {
  customLightSquareStyle: { backgroundColor: 'var(--color-slate-50)' },
  customDarkSquareStyle: { backgroundColor: 'var(--color-slate-200)' },
  customBoardStyle: { borderRadius: 10 },
} as const

const PROMOTION_PIECES: { value: PromotionPiece; label: string; symbol: string }[] = [
  { value: 'q', label: 'Queen', symbol: '♛' },
  { value: 'r', label: 'Rook', symbol: '♜' },
  { value: 'b', label: 'Bishop', symbol: '♝' },
  { value: 'n', label: 'Knight', symbol: '♞' },
]

function isPromotionMove(fen: string, from: Square, to: Square): boolean {
  const chess = new Chess(fen)
  const moves = chess.moves({ square: from, verbose: true })
  return moves.some((m) => m.to === to && m.promotion)
}

function detectGameEnd(fen: string): { isOver: boolean; reason: GameEndReason; winner: 'white' | 'black' | null } {
  try {
    const chess = new Chess(fen)
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'black' : 'white'
      return { isOver: true, reason: 'checkmate', winner }
    }
    if (chess.isStalemate()) return { isOver: true, reason: 'stalemate', winner: null }
    if (chess.isInsufficientMaterial()) return { isOver: true, reason: 'insufficient', winner: null }
    if (chess.isThreefoldRepetition()) return { isOver: true, reason: 'threefold', winner: null }
    if (chess.isDraw()) return { isOver: true, reason: 'fifty-move', winner: null }
    return { isOver: false, reason: null, winner: null }
  } catch {
    return { isOver: false, reason: null, winner: null }
  }
}

function gameEndMessage(reason: GameEndReason, winner: 'white' | 'black' | null): string {
  switch (reason) {
    case 'checkmate': return `Checkmate! ${winner === 'white' ? 'White' : 'Black'} wins.`
    case 'stalemate': return 'Draw by stalemate.'
    case 'insufficient': return 'Draw by insufficient material.'
    case 'threefold': return 'Draw by threefold repetition.'
    case 'fifty-move': return 'Draw by the fifty-move rule.'
    case 'draw': return 'Game drawn.'
    case 'aborted': return 'Game aborted.'
    case 'resigned': return 'Game ended by resignation.'
    default: return ''
  }
}

function PromotionChooser({ onSelect, onCancel }: { onSelect: (piece: PromotionPiece) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel} role="dialog" aria-label="Choose promotion piece">
      <div className="rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold text-slate-700">Promote pawn to:</div>
        <div className="flex gap-2">
          {PROMOTION_PIECES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelect(p.value)}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-2xl hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label={`Promote to ${p.label}`}
            >
              <span>{p.symbol}</span>
              <span className="text-[10px] text-slate-500">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function GameEndPanel({ reason, winner, onRestart, onQuit }: { reason: GameEndReason; winner: 'white' | 'black' | null; onRestart?: () => void; onQuit?: () => void }) {
  if (!reason) return null
  const msg = gameEndMessage(reason, winner)
  const isDraw = winner === null && reason !== 'aborted' && reason !== 'resigned'
  const bgClass = reason === 'aborted' ? 'bg-amber-50 border-amber-200' : isDraw ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
  const textClass = reason === 'aborted' ? 'text-amber-800' : isDraw ? 'text-blue-800' : 'text-emerald-800'

  return (
    <div className={`mb-3 rounded-lg border px-4 py-3 ${bgClass}`} role="status" aria-live="polite">
      <div className={`text-sm font-semibold ${textClass}`}>{msg}</div>
      <div className="mt-2 flex gap-2">
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Play again
          </button>
        ) : null}
        {onQuit ? (
          <button
            type="button"
            onClick={onQuit}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back to games
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel} role="dialog" aria-label={title}>
      <div className="max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-base font-semibold text-slate-800">{title}</div>
        <div className="mb-4 text-sm text-slate-600">{message}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type ParsedUci = {
  from: Square
  to: Square
  promotion?: string
}

function parseUciMove(uci: string): ParsedUci | null {
  if (!uci || uci.length < 4) return null
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion = uci.slice(4) || undefined
  return { from, to, promotion }
}

function sortedMoveRows(moveRows: MoveRow[]): MoveRow[] {
  return moveRows.slice().sort((a, b) => (a.ply || 0) - (b.ply || 0))
}

function buildMoveHistory(moveRows: MoveRow[]): MoveHistoryRow[] {
  if (!moveRows.length) return []
  const chess = new Chess()
  const history: MoveHistoryRow[] = []

  sortedMoveRows(moveRows)
    .forEach((mv, index) => {
      const parsed = parseUciMove(mv.uci)
      const ply = mv.ply || index + 1
      if (!parsed) return

      try {
        const played = chess.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
        })
        const san = played?.san ?? mv.uci

        const moveNumber = Math.ceil(ply / 2)
        const isWhite = ply % 2 === 1
        const rowIndex = moveNumber - 1
        if (!history[rowIndex]) {
          history[rowIndex] = { moveNumber, white: null, black: null }
        }
        history[rowIndex] = {
          ...history[rowIndex],
          [isWhite ? 'white' : 'black']: san,
        }
      } catch {
        // ignore invalid move in history replay
      }
    })

  return history
}

function buildMovesUci(moveRows: MoveRow[]) {
  return sortedMoveRows(moveRows).map((mv) => mv.uci)
}

function formatUciToSan(fen: string, uci: string) {
  const parsed = parseUciMove(uci)
  if (!parsed) return uci
  try {
    const chess = new Chess(fen)
    const move = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

function plyFromFen(fen: string): number {
  const parts = fen.split(' ')
  const turn = parts[1] as 'w' | 'b' | undefined
  const fullmove = Number(parts[5])
  const moveNumber = Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1
  return turn === 'b' ? ((moveNumber - 1) * 2) + 1 : ((moveNumber - 1) * 2)
}

function getEvalPercent(score: number | null) {
  if (score === null) return 50
  const clamped = Math.min(9, Math.max(-9, score))
  return ((clamped + 9) / 18) * 100
}

function skillLevelToEloLabel(skillLevel: number) {
  if (skillLevel <= 0) return '~800-900 (Beginner)'
  if (skillLevel <= 4) return '~1000-1200 (Novice)'
  if (skillLevel <= 8) return '~1300-1500 (Club)'
  if (skillLevel <= 12) return '~1600-1800 (Advanced Club)'
  if (skillLevel <= 16) return '~1900-2200 (Expert)'
  if (skillLevel <= 19) return '~2300-2500 (Master)'
  return 'Grandmaster'
}

function buildDisplayFen(sortedMoves: MoveRow[], gameFen: string | null, viewPly: number) {
  if (!sortedMoves.length) {
    return gameFen || START_FEN
  }

  const targetPly = Math.max(0, Math.min(viewPly, sortedMoves.length))

  if (targetPly === 0) {
    return START_FEN
  }

  const chess = new Chess(START_FEN)
  for (const mv of sortedMoves) {
    if ((mv.ply || 0) > targetPly) break
    const parsed = parseUciMove(mv.uci)
    if (!parsed) continue
    try {
      chess.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      })
    } catch {
      continue
    }
  }

  return chess.fen()
}

function useChessDisplay(moveRows: MoveRow[], gameFen: string | null, hoveredHintUci: string | null = null) {
  const [viewPly, setViewPly] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [showLegalMoves, setShowLegalMoves] = useState(true)
  const [showThreats, setShowThreats] = useState(false)
  const [showControlledArea, setShowControlledArea] = useState(false)
  const lastMoveCountRef = useRef(0)

  useEffect(() => {
    const currentCount = moveRows.length
    const prevCount = lastMoveCountRef.current
    lastMoveCountRef.current = currentCount
    setViewPly((prev) => (prev === prevCount ? currentCount : Math.min(prev, currentCount)))
  }, [moveRows.length])

  useEffect(() => {
    setSelectedSquare(null)
  }, [viewPly])

  const sortedMoves = useMemo(() => sortedMoveRows(moveRows), [moveRows])

  const displayFen = useMemo(() => buildDisplayFen(sortedMoves, gameFen, viewPly), [sortedMoves, gameFen, viewPly])

  const moveHistory = useMemo(() => buildMoveHistory(sortedMoves), [sortedMoves])

  useEffect(() => {
    if (!showLegalMoves) setSelectedSquare(null)
  }, [showLegalMoves, displayFen])

  const legalMoveStyles = useMemo(() => {
    if (!showLegalMoves || !selectedSquare) return {}
    const chess = new Chess(displayFen)
    const moves = chess.moves({ square: selectedSquare, verbose: true }) as Array<{ to: Square }>
    const styles: Record<string, React.CSSProperties> = {
      [selectedSquare]: { backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 24%, transparent)' },
    }
    for (const move of moves) {
      styles[move.to] = {
        backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 14%, transparent)',
        boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-blue-500) 55%, transparent)',
      }
    }
    return styles
  }, [displayFen, selectedSquare, showLegalMoves])

  const controlledAreaStyles = useMemo(() => {
    if (!showControlledArea) return {}

    const chess = new Chess(displayFen)
    const board = chess.board()
    const whiteControlled = new Set<string>()
    const blackControlled = new Set<string>()

    const inBounds = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8
    const toSquare = (row: number, col: number): Square => `${String.fromCharCode(97 + col)}${8 - row}` as Square
    const addControl = (set: Set<string>, row: number, col: number) => {
      if (inBounds(row, col)) set.add(toSquare(row, col))
    }

    const stepControl = (
      set: Set<string>,
      row: number,
      col: number,
      directions: Array<[number, number]>,
      maxSteps: number,
    ) => {
      for (const [dr, dc] of directions) {
        let nextRow = row + dr
        let nextCol = col + dc
        let steps = 0
        while (inBounds(nextRow, nextCol) && steps < maxSteps) {
          set.add(toSquare(nextRow, nextCol))
          if (board[nextRow][nextCol]) break
          nextRow += dr
          nextCol += dc
          steps += 1
        }
      }
    }

    for (let row = 0; row < board.length; row += 1) {
      for (let col = 0; col < board[row].length; col += 1) {
        const piece = board[row][col]
        if (!piece) continue

        const controlled = piece.color === 'w' ? whiteControlled : blackControlled

        switch (piece.type) {
          case 'p': {
            const dir = piece.color === 'w' ? -1 : 1
            addControl(controlled, row + dir, col - 1)
            addControl(controlled, row + dir, col + 1)
            break
          }
          case 'n':
            for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as Array<[number, number]>) {
              addControl(controlled, row + dr, col + dc)
            }
            break
          case 'b':
            stepControl(controlled, row, col, [[-1, -1], [-1, 1], [1, -1], [1, 1]], 8)
            break
          case 'r':
            stepControl(controlled, row, col, [[-1, 0], [1, 0], [0, -1], [0, 1]], 8)
            break
          case 'q':
            stepControl(controlled, row, col, [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]], 8)
            break
          case 'k':
            stepControl(controlled, row, col, [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]], 1)
            break
          default:
            break
        }
      }
    }

    const styles: Record<string, React.CSSProperties> = {}
    const allSquares = new Set<string>([...whiteControlled, ...blackControlled])
    for (const square of allSquares) {
      const white = whiteControlled.has(square)
      const black = blackControlled.has(square)
      if (white && black) {
        styles[square] = {
          backgroundColor: 'color-mix(in srgb, var(--color-purple-500) 16%, transparent)',
          boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-purple-500) 45%, transparent)',
        }
      } else if (white) {
        styles[square] = {
          backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 10%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-blue-500) 45%, transparent)',
        }
      } else {
        styles[square] = {
          backgroundColor: 'color-mix(in srgb, var(--color-red-500) 10%, transparent)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-red-500) 45%, transparent)',
        }
      }
    }
    return styles
  }, [displayFen, showControlledArea])

  // Debounced threat computation to avoid UI lag on mobile/lower-end devices
  const [threatStyles, setThreatStyles] = useState<Record<string, React.CSSProperties>>({})
  const threatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (threatTimerRef.current) {
      clearTimeout(threatTimerRef.current)
      threatTimerRef.current = null
    }

    if (!showThreats) {
      setThreatStyles({})
      return
    }

    threatTimerRef.current = setTimeout(() => {
      const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
      const withTurn = (fen: string, turn: 'w' | 'b') => {
        const parts = fen.split(' ')
        if (parts.length >= 2) {
          parts[1] = turn
          return parts.join(' ')
        }
        return fen
      }

      const buildAttackMap = (fen: string, turn: 'w' | 'b') => {
        const chess = new Chess(withTurn(fen, turn))
        const board = chess.board()
        const attacks = new Map<string, Array<string>>()

        for (let r = 0; r < board.length; r += 1) {
          for (let c = 0; c < board[r].length; c += 1) {
            const piece = board[r][c]
            if (!piece || piece.color !== turn) continue
            const file = String.fromCharCode(97 + c)
            const rank = 8 - r
            const square = `${file}${rank}` as Square
            const moves = chess.moves({ square, verbose: true }) as Array<{ to: Square; piece: string }>
            for (const move of moves) {
              const list = attacks.get(move.to) ?? []
              list.push(move.piece)
              attacks.set(move.to, list)
            }
          }
        }
        return attacks
      }

      const chess = new Chess(displayFen)
      const board = chess.board()
      const attacksByWhite = buildAttackMap(displayFen, 'w')
      const attacksByBlack = buildAttackMap(displayFen, 'b')
      const styles: Record<string, React.CSSProperties> = {}

      const isDefended = (fen: string, square: Square, color: 'w' | 'b') => {
        const defender = new Chess(withTurn(fen, color))
        defender.remove(square)
        const moves = defender.moves({ verbose: true }) as Array<{ to: string }>
        return moves.some((move) => move.to === square)
      }

      for (let r = 0; r < board.length; r += 1) {
        for (let c = 0; c < board[r].length; c += 1) {
          const piece = board[r][c]
          if (!piece) continue
          const file = String.fromCharCode(97 + c)
          const rank = 8 - r
          const square = `${file}${rank}` as Square
          const attackedBy = piece.color === 'w' ? attacksByBlack : attacksByWhite
          const attackers = attackedBy.get(square) ?? []
          if (!attackers.length) continue

          const defended = isDefended(displayFen, square, piece.color)
          const pieceValue = pieceValues[piece.type] ?? 0
          const minAttacker = Math.min(...attackers.map((type) => pieceValues[type] ?? 0))
          const valueThreat = minAttacker > 0 && minAttacker < pieceValue

          if (valueThreat) {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-red-500) 16%, transparent)',
              boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-red-500) 65%, transparent)',
            }
          } else if (!defended) {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-amber-500) 18%, transparent)',
              boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-amber-500) 65%, transparent)',
            }
          } else {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 12%, transparent)',
              boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-blue-500) 60%, transparent)',
            }
          }
        }
      }

      setThreatStyles(styles)
    }, 150) // 150ms debounce to prevent jank on rapid position changes

    return () => {
      if (threatTimerRef.current) {
        clearTimeout(threatTimerRef.current)
        threatTimerRef.current = null
      }
    }
  }, [displayFen, showThreats])

  const hintHoverStyles = useMemo(() => {
    if (!hoveredHintUci) return {}
    const parsed = parseUciMove(hoveredHintUci)
    if (!parsed) return {}

    return {
      [parsed.from]: {
        backgroundColor: 'color-mix(in srgb, var(--color-purple-500) 24%, transparent)',
        boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-purple-500) 62%, transparent)',
      },
      [parsed.to]: {
        backgroundColor: 'color-mix(in srgb, var(--color-purple-500) 30%, transparent)',
        boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-purple-500) 70%, transparent)',
      },
    } as Record<string, React.CSSProperties>
  }, [hoveredHintUci])

  const customSquareStyles = useMemo(() => ({
    ...controlledAreaStyles,
    ...threatStyles,
    ...legalMoveStyles,
    ...hintHoverStyles,
  }), [controlledAreaStyles, hintHoverStyles, legalMoveStyles, threatStyles])

  return {
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    selectedSquare,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    showControlledArea,
    setShowControlledArea,
    customSquareStyles,
  }
}

function TopHintsList({ hintMoves, onHoverOrClick }: { hintMoves: HintMove[]; onHoverOrClick: (uci: string | null) => void }) {
  if (!hintMoves.length) return <div className="text-xs text-slate-500">No hints yet.</div>

  return (
    <ol className="space-y-1 text-sm text-slate-700">
      {hintMoves.map((move, idx) => (
        <li key={`${move.uci}-${idx}`}>
          <button
            type="button"
            className="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            onMouseEnter={() => onHoverOrClick(move.uci)}
            onMouseLeave={() => onHoverOrClick(null)}
            onClick={() => onHoverOrClick(move.uci)}
          >
            {idx + 1}. {move.san}
          </button>
        </li>
      ))}
    </ol>
  )
}

function useChessboardSize(maxSize: number) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [boardSize, setBoardSize] = useState(Math.min(maxSize, 400))

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      setBoardSize(maxSize)
      return
    }

    const updateSize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width) return

      const safeWidth = Math.max(0, width - 16)

      // Desktop (lg:flex-1 gives real height from flex) → constrain to
      // both dimensions so the square board fits.  Mobile/tablet (stacked
      // layout, natural height) → width only; the board determines its own
      // height and the parent page scrolls.
      const isDesktopRow = window.innerWidth >= 1024
      let limit: number

      if (isDesktopRow && height > 100) {
        const safeHeight = Math.max(0, height - 16)
        limit = Math.min(safeWidth, safeHeight)
      } else {
        limit = safeWidth
      }

      const next = Math.max(180, Math.min(maxSize, limit))
      setBoardSize(next)
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    window.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [maxSize])

  return { containerRef, boardSize }
}

export default function ChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  if (gameId === 'local') {
    return <LocalChessGame />
  }
  return <OnlineChessGame />
}

function OnlineChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [refreshToken, setRefreshToken] = useState(0)
  const loadGameDataRef = useRef<(() => void) | null>(null)
  const handleGameUpdate = useCallback(() => { loadGameDataRef.current?.() }, [])
  const { moves, loading: movesLoading, refetch: refetchMoves } = useGameRealtime(gameId || null, refreshToken, handleGameUpdate)
  const [game, setGame] = useState<GameRow | null>(null)
  const [members, setMembers] = useState<GameMemberProfile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  const [restartLoading, setRestartLoading] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null)
  const [debugCopied, setDebugCopied] = useState(false)
  // whether hints are currently visible (after clicking the single Show Hints button)
  const [showHintsVisible, setShowHintsVisible] = useState(false)
  // which UCI is currently hovered / tapped to highlight squares
  const [hoveredHintUci, setHoveredHintUci] = useState<string | null>(null)
  const [hintCount, setHintCount] = useState(0)
  const [pendingHintPly, setPendingHintPly] = useState<number | null>(null)
  const [tutorLoading, setTutorLoading] = useState(false)
  const [tutorAnalysis, setTutorAnalysis] = useState<ChessTutorAnalysis | null>(null)
  const [tutorError, setTutorError] = useState<string | null>(null)
  const [tutorModel, setTutorModel] = useState<string>('gemini')

  const moveRows = useMemo(() => (moves ?? []) as MoveRow[], [moves])
  const hintedByPly = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const move of moveRows) {
      const ply = Number(move.ply)
      if (!Number.isFinite(ply)) continue
      map.set(ply, move.hint_used === true)
    }
    return map
  }, [moveRows])

  useEffect(() => {
    console.table(moveRows.map((m) => ({ ply: m.ply, uci: m.uci, hinted: m.hint_used })))
  }, [moveRows])

  // Clear optimistic FEN once the realtime event delivers the new move
  useEffect(() => {
    setOptimisticFen(null)
  }, [moveRows.length])

  const loadGameData = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    setAuthError(false)

    try {
      const [g, gm] = await Promise.all([
        fetchGame(gameId),
        fetchGameMembers(gameId),
      ])
      setGame(g)
      setMembers(gm)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load game'
      const looksLikeAuth = /jwt|token|auth/i.test(message)
      setError(looksLikeAuth ? 'Session expired. Please sign in again.' : 'Failed to load game. Please try again.')
      setAuthError(looksLikeAuth)
      setGame(null)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [gameId])
  loadGameDataRef.current = () => { void loadGameData() }

  useEffect(() => {
    void loadGameData()
  }, [loadGameData])

  // Clear active hint UI after any new move arrives from realtime state.
  useEffect(() => {
    if (moveRows.length > 0) {
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      setPendingHintPly(null)
    }
  }, [moveRows.length])

  

  const {
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    showControlledArea,
    setShowControlledArea,
    customSquareStyles,
  } = useChessDisplay(moveRows, game?.current_fen ?? null, hoveredHintUci)
  const moveHistoryRowsNewestFirst = useMemo(() => [...moveHistory].reverse(), [moveHistory])
  const { containerRef: boardContainerRef, boardSize } = useChessboardSize(CHESSBOARD_MAX_SIZE)

  async function onDrop(sourceSquare: Square, targetSquare: Square, currentFen: string, promotion: PromotionPiece = 'q') {
    if (!gameId) return false
    if (game?.status === 'aborted') return false
    if (viewPly !== moveRows.length) return false
    const c = new Chess(currentFen || START_FEN)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false
    const fenAfter = c.fen()
    // Show the new position immediately (optimistic) so the piece doesn't snap back
    setOptimisticFen(fenAfter)
    try {
      const ply = moveRows.length + 1
      const hintUsedForPly = pendingHintPly === ply
      await makeMove(gameId, ply, `${move.from}${move.to}${move.promotion ?? ''}`, fenAfter, hintUsedForPly)
      setPendingHintPly(null)
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      setViewPly(ply)
      setSelectedSquare(null)
      // Safety-net: ensure we have the move in local state even if the
      // realtime INSERT event is delayed or missed entirely.
      refetchMoves()
      void loadGameData()
      return true
    } catch (err) {
      // Revert optimistic FEN on failure
      setOptimisticFen(null)
      const message = err instanceof Error ? err.message : 'Move failed'
      setToastSeverity('error')
      setToastMessage(message)
      return false
    }
  }

  async function handleRestartGame() {
    if (!gameId) return
    setShowRestartConfirm(false)
    setError(null)
    setRestartLoading(true)
    try {
      const maybeGame = await restartGame(gameId)
      setViewPly(0)
      setSelectedSquare(null)
      void loadGameData()
      setRefreshToken((prev) => prev + 1)
      setToastSeverity('success')
      setToastMessage('Game restarted')
      if (maybeGame && typeof maybeGame === 'object') setGame(maybeGame as GameRow)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restart game'
      setError(message)
      setToastSeverity('error')
      setToastMessage(message)
    } finally {
      setRestartLoading(false)
    }
  }

  async function handleQuitGame() {
    if (!gameId) {
      navigate('/games')
      return
    }

    try {
      await abortGame(gameId)
    } catch {
      // Keep navigation resilient even if quit persistence fails.
    } finally {
      navigate('/games')
    }
  }

  const normalizedDisplayFen = optimisticFen || displayFen || START_FEN
  const currentTurn = (normalizedDisplayFen.split(' ')[1] as 'w' | 'b' | undefined) || (game?.current_turn as 'w' | 'b' | null) || null
  const currentUserId = user?.id ?? null
  const boardId = `${gameId ?? 'game'}-${currentUserId ?? 'anon'}-online`
  const fenBoard = normalizedDisplayFen.split(' ')[0] || ''
  const displayFenBoard = displayFen.split(' ')[0] || ''
  const optimisticFenBoard = optimisticFen ? (optimisticFen.split(' ')[0] || '') : ''
  const gameFenBoard = game?.current_fen ? (game.current_fen.split(' ')[0] || '') : ''
  const lastMoveUci = moveRows.length ? moveRows[moveRows.length - 1].uci : 'none'
  const moveDigest = moveRows.map((mv) => `${mv.ply ?? '?'}:${mv.uci ?? '?'}`).join(',')
  const currentMember = members.find((member) => member.user_id === currentUserId) ?? null

  const whiteMember = members.find((member) => member.role === 'white') ?? null
  const blackMember = members.find((member) => member.role === 'black') ?? null

  const isCurrentWhite = currentMember?.role === 'white'
  const isCurrentBlack = currentMember?.role === 'black'

  const topPlayer = isCurrentWhite ? blackMember : whiteMember
  const bottomPlayer = isCurrentBlack ? blackMember : whiteMember

  const topIsWhite = topPlayer?.role === 'white'
  const bottomIsWhite = bottomPlayer?.role === 'white'

  const renderPlayerLabel = (label: GameMemberProfile | null, isTurn: boolean, fallback: string) => {
    const role = label?.role
    const displayName = label?.username || fallback
    const roleLabel = role === 'white' ? 'White' : role === 'black' ? 'Black' : role || 'Player'
    const roleBadgeClass = role === 'white'
      ? 'bg-slate-100 text-slate-700'
      : role === 'black'
        ? 'bg-slate-800 text-white'
        : 'bg-slate-200 text-slate-600'

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isTurn ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-slate-800">{displayName}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${roleBadgeClass}`}>
          {roleLabel}
        </span>
      </div>
    )
  }

  const topFallback = topPlayer ? 'Opponent' : 'Waiting for opponent'
  const bottomFallback = currentMember ? 'You' : 'Player'

  const memberCountLabel = `${members.length}/2 players`
  const isAborted = game?.status === 'aborted'
  const isViewingPast = viewPly < moveRows.length
  const isMember = Boolean(currentMember)
  const isUserTurn = (currentTurn === 'w' && isCurrentWhite) || (currentTurn === 'b' && isCurrentBlack)
  const gameEnd = useMemo(() => {
    if (isAborted) return { isOver: true, reason: 'aborted' as GameEndReason, winner: null }
    return detectGameEnd(normalizedDisplayFen)
  }, [isAborted, normalizedDisplayFen])
  const canMove = !isAborted && !gameEnd.isOver && !isViewingPast && isMember && isUserTurn && !pendingPromotion
  const boardOrientation: 'white' | 'black' = isCurrentBlack ? 'black' : 'white'
  const boardKey = `${boardId}:${boardOrientation}:${normalizedDisplayFen}`

  const { isReady, topMoves, evaluation, analyzePosition, skillLevel, setSkillLevel } = useStockfish()
  const opening = useMemo(() => findOpening(buildMovesUci(moveRows)), [moveRows])
  const evalPercent = useMemo(() => getEvalPercent(evaluation.score), [evaluation.score])

  useEffect(() => {
    if (!isReady) return
    const handle = setTimeout(() => {
      analyzePosition(normalizedDisplayFen)
    }, 200)
    return () => clearTimeout(handle)
  }, [analyzePosition, isReady, normalizedDisplayFen])

  const hintMoves: HintMove[] = useMemo(() => (
    topMoves.map((move) => ({
      ...move,
      san: formatUciToSan(normalizedDisplayFen, move.uci),
    }))
  ), [normalizedDisplayFen, topMoves])

  const handleAnalyzeGameForMe = useCallback(async () => {
    setTutorLoading(true)
    setTutorError(null)
    try {
      const result = await analyzeGameForMe({
        fen: normalizedDisplayFen,
        moves: moveRows.map((move) => move.uci),
      })
      setTutorAnalysis(result.analysis)
      setTutorModel(result.model)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze game'
      setTutorError(message)
    } finally {
      setTutorLoading(false)
    }
  }, [moveRows, normalizedDisplayFen])

  return (
    <div className="flex flex-col rounded-2xl bg-slate-100/80 p-4 shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chess</h2>
          <div className="text-xs text-slate-500">
            Status: {game?.status ?? 'loading'}
            {currentMember?.role ? ` · You are ${currentMember.role}` : ' · Spectating'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestartConfirm(true)}
            disabled={restartLoading}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {restartLoading ? 'Restarting…' : 'Restart game'}
          </button>
          <button
            onClick={() => { void handleQuitGame() }}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Quit
          </button>
        </div>
      </div>
      {error ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshToken((prev) => prev + 1)
                void loadGameData()
              }}
              className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700"
            >
              Retry
            </button>
            {authError ? (
              <button
                onClick={() => { void supabase.auth.signOut() }}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {!isMember && !loading && !movesLoading ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You are signed in but not recognized as a player in this game. The board is read-only until you join.
          {import.meta.env.DEV ? (
            <div className="mt-1 text-xs text-amber-700">
              userId: {currentUserId ?? 'none'} · members: {members.map((m) => `${m.user_id}:${m.role}`).join(', ') || 'none'}
            </div>
          ) : null}
        </div>
      ) : null}
      <GameEndPanel
        reason={gameEnd.reason}
        winner={gameEnd.winner}
        onRestart={() => setShowRestartConfirm(true)}
        onQuit={() => { void handleQuitGame() }}
      />
      {showRestartConfirm ? (
        <ConfirmDialog
          title="Restart game?"
          message="This will reset the board and clear all moves. Both players will start over."
          confirmLabel="Restart"
          onConfirm={() => { void handleRestartGame() }}
          onCancel={() => setShowRestartConfirm(false)}
        />
      ) : null}
      {pendingPromotion ? (
        <PromotionChooser
          onSelect={(piece) => {
            const { from, to, fen } = pendingPromotion
            setPendingPromotion(null)
            void onDrop(from, to, fen, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:min-h-0 lg:min-w-0 lg:flex-1">
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', topFallback)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewPly((prev) => Math.max(0, prev - 1))}
                disabled={viewPly === 0}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                onClick={() => setViewPly((prev) => Math.min(moveRows.length, prev + 1))}
                disabled={viewPly >= moveRows.length}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Redo
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLegalMoves}
                  onChange={(event) => setShowLegalMoves(event.target.checked)}
                  className="h-4 w-4"
                />
                Show legal moves
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showThreats}
                  onChange={(event) => setShowThreats(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight threats
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showControlledArea}
                  onChange={(event) => setShowControlledArea(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight controlled area
              </label>
            </div>
            {isViewingPast ? (
              <span className="text-xs text-slate-500">Viewing move {viewPly}/{moveRows.length}</span>
            ) : (
              <span className="text-xs text-slate-500">Live</span>
            )}
          </div>
          <div ref={boardContainerRef} className="flex w-full items-center justify-center overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm" style={{ maxWidth: boardSize + 8 }}>
              <Chessboard
                id={boardId}
                key={boardKey}
                position={normalizedDisplayFen}
                boardOrientation={boardOrientation}
                showBoardNotation
                {...CHESSBOARD_THEME}
                onPieceDrop={(src: Square, dst: Square) => {
                  if (!canMove) return false
                  try {
                    if (isPromotionMove(normalizedDisplayFen, src, dst)) {
                      setPendingPromotion({ from: src, to: dst, fen: normalizedDisplayFen })
                      return false
                    }
                    const test = new Chess(normalizedDisplayFen || START_FEN)
                    const move = test.move({ from: src, to: dst })
                    if (!move) return false
                    void onDrop(src, dst, normalizedDisplayFen)
                    return true
                  } catch {
                    return false
                  }
                }}
                onSquareClick={(square: Square) => {
                  if (!showLegalMoves) return
                  setSelectedSquare((prev) => (prev === square ? null : square))
                }}
                boardWidth={boardSize}
                arePiecesDraggable={canMove}
                customSquareStyles={customSquareStyles}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(bottomPlayer || null, bottomIsWhite ? currentTurn === 'w' : currentTurn === 'b', bottomFallback)}
          </div>
        </div>

        <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:w-[360px] lg:shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
            {loading || movesLoading ? (
              <span className="text-xs text-slate-500">Loading…</span>
            ) : null}
          </div>
            <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>
          {import.meta.env.DEV ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Debug</span>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                  onClick={() => {
                    const summary = [
                      `game=${gameId ?? 'none'}`,
                      `user=${currentUserId ?? 'none'}`,
                      `members=${members.length ? members.map((m) => `${m.user_id}:${m.role}`).join(', ') : 'none'}`,
                      `turn=${currentTurn ?? 'unknown'}`,
                      `status=${game?.status ?? 'unknown'}`,
                      `orientation=${boardOrientation}`,
                      `isUserTurn=${isUserTurn}`,
                      `canMove=${Boolean(canMove)}`,
                      `isViewingPast=${Boolean(isViewingPast)}`,
                      `viewPly=${viewPly}`,
                      `moves=${moveRows.length}`,
                      `lastMove=${lastMoveUci}`,
                      `boardId=${boardId}`,
                      `boardKey=${boardKey}`,
                      `fen=${normalizedDisplayFen}`,
                      `displayFen=${displayFen}`,
                      `optimisticFen=${optimisticFen ?? 'null'}`,
                      `gameFen=${game?.current_fen ?? 'null'}`,
                      `moveDigest=${moveDigest || 'none'}`,
                    ].join(' | ')
                    void navigator.clipboard?.writeText(summary)
                    setDebugCopied(true)
                    setTimeout(() => setDebugCopied(false), 1500)
                  }}
                >
                  {debugCopied ? 'Copied' : 'Copy debug'}
                </button>
              </div>
              <div>game {gameId ?? 'none'}</div>
              <div>user {currentUserId ?? 'none'}</div>
              <div>members {members.length ? members.map((m) => `${m.user_id}:${m.role}`).join(', ') : 'none'}</div>
              <div>turn {currentTurn ?? 'unknown'}</div>
              <div>status {game?.status ?? 'unknown'}</div>
              <div>orientation {boardOrientation} · userTurn {String(isUserTurn)} · canMove {String(Boolean(canMove))}</div>
              <div>boardId {boardId.slice(0, 28)}…</div>
              <div>boardKey {boardKey.slice(0, 36)}…</div>
              <div className={moveRows.length === 0 ? 'font-bold text-red-600' : ''}>
                viewPly {viewPly} / moves {moveRows.length}
              </div>
              <div>lastMove {lastMoveUci}</div>
              <div>fen {fenBoard.slice(0, 30)}{fenBoard.length > 30 ? '…' : ''}</div>
              <div>displayFen {displayFenBoard.slice(0, 26)}{displayFenBoard.length > 26 ? '…' : ''}</div>
              <div>optimisticFen {optimisticFenBoard ? `${optimisticFenBoard.slice(0, 22)}…` : 'null'}</div>
              <div>gameFen {gameFenBoard ? `${gameFenBoard.slice(0, 24)}…` : 'null'}</div>
              <div>moveDigest {moveDigest ? `${moveDigest.slice(0, 42)}${moveDigest.length > 42 ? '…' : ''}` : 'none'}</div>
              <button
                type="button"
                className="mt-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                onClick={() => {
                  setRefreshToken((prev) => prev + 1)
                  void loadGameData()
                }}
              >
                Force refresh
              </button>
            </div>
          ) : null}
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold text-slate-600">Opening</div>
            <div className="text-sm text-slate-800">{opening?.name ?? 'Unknown'}</div>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600">Engine</div>
              <span className="text-[11px] text-slate-500">{isReady ? 'ready' : 'loading'}</span>
            </div>
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="online-engine-skill" className="text-xs text-slate-600">Opponent skill</label>
                <span className="text-xs font-semibold text-slate-700">Level {skillLevel}</span>
              </div>
              <input
                id="online-engine-skill"
                type="range"
                min={0}
                max={20}
                step={1}
                value={skillLevel}
                onChange={(event) => setSkillLevel(Number(event.target.value))}
                aria-label="Stockfish opponent skill level"
                className="w-full"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>0 · ~800-900</span>
                <span>20 · Grandmaster</span>
              </div>
              <div className="mt-1 text-xs text-slate-600">Approximate Elo: {skillLevelToEloLabel(skillLevel)}</div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Evaluation</div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${evalPercent}%` }} />
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Top hints <span className="text-xs text-slate-500">(used: {hintCount})</span></div>
              {!showHintsVisible ? (
                <div className="flex">
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!isUserTurn}
                    onClick={() => {
                      if (!isUserTurn) return
                      const nextPly = moveRows.length + 1
                      setPendingHintPly(nextPly)
                      setShowHintsVisible(true)
                      setHintCount((c) => c + 1)
                    }}
                  >
                    Show hints
                  </button>
                </div>
              ) : (
                <TopHintsList hintMoves={hintMoves} onHoverOrClick={(uci) => setHoveredHintUci(uci)} />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {moveHistoryRowsNewestFirst.length ? (
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="w-10 py-2">#</th>
                    <th className="py-2">White</th>
                    <th className="py-2">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {moveHistoryRowsNewestFirst.map((row) => {
                    const whitePly = (row.moveNumber * 2) - 1
                    const blackPly = row.moveNumber * 2
                    const whiteHint = hintedByPly.get(whitePly) === true
                    const blackHint = hintedByPly.get(blackPly) === true
                    return (
                      <tr key={row.moveNumber} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-xs text-slate-500">{row.moveNumber}.</td>
                        <td className={`py-2 font-medium ${whiteHint ? 'text-purple-600' : ''}`}>
                          {row.white ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(whitePly)}
                            >
                              <span>{row.white}</span>
                              {whiteHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                        <td className={`py-2 font-medium ${blackHint ? 'text-purple-600' : ''}`}>
                          {row.black ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(blackPly)}
                            >
                              <span>{row.black}</span>
                              {blackHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">No moves yet.</div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Game: {gameId}
          </div>
        </aside>

        <ChessTutorPanel
          analysis={tutorAnalysis}
          modelLabel={tutorModel}
          loading={tutorLoading}
          error={tutorError}
          onAnalyze={() => { void handleAnalyzeGameForMe() }}
        />
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
  )
}

function LocalChessGame(): React.JSX.Element {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [localMoves, setLocalMoves] = useState<MoveRow[]>([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  const [engineThinking, setEngineThinking] = useState(false)
  const [pendingEngineFen, setPendingEngineFen] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  // hint visibility and hover state for local game
  const [showHintsVisible, setShowHintsVisible] = useState(false)
  const [hoveredHintUci, setHoveredHintUci] = useState<string | null>(null)
  const [hintCount, setHintCount] = useState(0)
  const [hintedPlys, setHintedPlys] = useState<number[]>([])
  const [tutorLoading, setTutorLoading] = useState(false)
  const [tutorAnalysis, setTutorAnalysis] = useState<ChessTutorAnalysis | null>(null)
  const [tutorError, setTutorError] = useState<string | null>(null)
  const [tutorModel, setTutorModel] = useState<string>('gemini')
  const lastShownPlyRef = useRef<number | null>(null)

  const moveRows = useMemo(() => localMoves, [localMoves])
  const {
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    showControlledArea,
    setShowControlledArea,
    customSquareStyles,
  } = useChessDisplay(moveRows, START_FEN, hoveredHintUci)
  const moveHistoryRowsNewestFirst = useMemo(() => [...moveHistory].reverse(), [moveHistory])
  const { containerRef: boardContainerRef, boardSize } = useChessboardSize(CHESSBOARD_MAX_SIZE)

  const normalizedDisplayFen = displayFen || START_FEN
  const currentTurn = normalizedDisplayFen.split(' ')[1] || 'w'

  const currentUserId = user?.id ?? 'local-user'
  const members: GameMemberProfile[] = [
    { user_id: currentUserId, role: 'white', username: user?.email ?? 'You' },
    { user_id: 'stockfish', role: 'black', username: 'Stockfish' },
  ]

  const whiteMember = members.find((member) => member.role === 'white') ?? null
  const blackMember = members.find((member) => member.role === 'black') ?? null

  const topPlayer = blackMember
  const bottomPlayer = whiteMember

  const topIsWhite = topPlayer?.role === 'white'
  const bottomIsWhite = bottomPlayer?.role === 'white'

  const renderPlayerLabel = (label: GameMemberProfile | null, isTurn: boolean, fallback: string) => {
    const role = label?.role
    const displayName = label?.username || fallback
    const roleLabel = role === 'white' ? 'White' : role === 'black' ? 'Black' : role || 'Player'
    const roleBadgeClass = role === 'white'
      ? 'bg-slate-100 text-slate-700'
      : role === 'black'
        ? 'bg-slate-800 text-white'
        : 'bg-slate-200 text-slate-600'

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isTurn ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-slate-800">{displayName}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${roleBadgeClass}`}>
          {roleLabel}
        </span>
      </div>
    )
  }

  const memberCountLabel = 'Local game'
  const isViewingPast = viewPly < moveRows.length
  const gameEnd = useMemo(() => detectGameEnd(normalizedDisplayFen), [normalizedDisplayFen])
  const canMove = !engineThinking && !isViewingPast && !gameEnd.isOver && !pendingPromotion

  const { isReady, topMoves, evaluation, analyzePosition, getEngineMove, cancelPendingMove, skillLevel, setSkillLevel } = useStockfish()
  const opening = useMemo(() => findOpening(buildMovesUci(moveRows)), [moveRows])
  const evalPercent = useMemo(() => getEvalPercent(evaluation.score), [evaluation.score])

  useEffect(() => {
    if (!isReady || engineThinking) return
    const handle = setTimeout(() => {
      analyzePosition(normalizedDisplayFen)
    }, 200)
    return () => clearTimeout(handle)
  }, [analyzePosition, engineThinking, isReady, normalizedDisplayFen])

  useEffect(() => {
    if (!isReady || !pendingEngineFen || engineThinking) return
    const fen = pendingEngineFen
    setPendingEngineFen(null)
    void applyEngineMove(fen)
  }, [engineThinking, isReady, pendingEngineFen])

  // Clear any visible hints after the move that the hints were shown for occurs
  useEffect(() => {
    if (lastShownPlyRef.current != null && moveRows.length > lastShownPlyRef.current) {
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      lastShownPlyRef.current = null
    }
  }, [moveRows.length])

  const hintMoves: HintMove[] = useMemo(() => (
    topMoves.map((move) => ({
      ...move,
      san: formatUciToSan(normalizedDisplayFen, move.uci),
    }))
  ), [normalizedDisplayFen, topMoves])

  const handleAnalyzeGameForMe = useCallback(async () => {
    setTutorLoading(true)
    setTutorError(null)
    try {
      const result = await analyzeGameForMe({
        fen: normalizedDisplayFen,
        moves: moveRows.map((move) => move.uci),
      })
      setTutorAnalysis(result.analysis)
      setTutorModel(result.model)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze game'
      setTutorError(message)
    } finally {
      setTutorLoading(false)
    }
  }, [moveRows, normalizedDisplayFen])

  const truncateMoves = (targetPly: number) => {
    cancelPendingMove()
    setPendingEngineFen(null)
    setEngineThinking(false)
    setLocalMoves((prev) => prev.slice(0, Math.max(0, targetPly)))
    setViewPly(Math.max(0, targetPly))
    setSelectedSquare(null)
  }

  async function applyEngineMove(fen: string) {
    if (!isReady) {
      setPendingEngineFen(fen)
      setToastSeverity('info')
      setToastMessage('Engine is warming up...')
      return
    }
    setEngineThinking(true)
    try {
      const bestMove = await getEngineMove(fen)
      if (!bestMove || bestMove === '0000') return
      const parsed = parseUciMove(bestMove)
      if (!parsed) return
      const chess = new Chess(fen)
      const move = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion })
      if (!move) return
      const fenAfter = chess.fen()
      const ply = plyFromFen(fenAfter)
      const row: MoveRow = {
        ply,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        created_by: 'stockfish',
        created_at: new Date().toISOString(),
        fen_after: fenAfter,
      }
      setLocalMoves((prev) => [...prev, row])
      setViewPly(ply)
    } catch {
      setToastSeverity('error')
      setToastMessage('Engine failed to make a move')
    } finally {
      setEngineThinking(false)
    }
  }

  async function onDrop(sourceSquare: Square, targetSquare: Square, currentFen: string, promotion: PromotionPiece = 'q') {
    if (viewPly !== moveRows.length) {
      truncateMoves(viewPly)
    }
    if (engineThinking) return false

    const c = new Chess(currentFen || START_FEN)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false
    const fenAfter = c.fen()
    const ply = plyFromFen(fenAfter)
    const row: MoveRow = {
      ply,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
      fen_after: fenAfter,
    }
    setLocalMoves((prev) => [...prev, row])
    setViewPly(ply)
    setSelectedSquare(null)

    if (c.isGameOver()) {
      return true
    }

    void applyEngineMove(fenAfter)
    return true
  }

  function handleRestartGame() {
    setShowRestartConfirm(false)
    truncateMoves(0)
    setToastSeverity('success')
    setToastMessage('Local game restarted')
  }

  function handleUndoMove() {
    if (!moveRows.length) return
    truncateMoves(Math.max(0, viewPly - 1))
  }

  function handleQuitGame() {
    truncateMoves(0)
    navigate('/games')
  }

  return (
    <div className="flex flex-col rounded-2xl bg-slate-100/80 p-4 shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chess (Local)</h2>
          <div className="text-xs text-slate-500">Status: {engineThinking ? 'thinking' : 'ready'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestartConfirm(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            Restart
          </button>
          <button
            onClick={handleQuitGame}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Quit
          </button>
        </div>
      </div>
      <GameEndPanel
        reason={gameEnd.reason}
        winner={gameEnd.winner}
        onRestart={() => setShowRestartConfirm(true)}
        onQuit={handleQuitGame}
      />
      {showRestartConfirm ? (
        <ConfirmDialog
          title="Restart game?"
          message="This will reset the board and clear all moves."
          confirmLabel="Restart"
          onConfirm={handleRestartGame}
          onCancel={() => setShowRestartConfirm(false)}
        />
      ) : null}
      {pendingPromotion ? (
        <PromotionChooser
          onSelect={(piece) => {
            const { from, to, fen } = pendingPromotion
            setPendingPromotion(null)
            void onDrop(from, to, fen, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:min-h-0 lg:min-w-0 lg:flex-1">
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', 'Stockfish')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                onClick={handleUndoMove}
                disabled={viewPly === 0}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Undo
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLegalMoves}
                  onChange={(event) => setShowLegalMoves(event.target.checked)}
                  className="h-4 w-4"
                />
                Show legal moves
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showThreats}
                  onChange={(event) => setShowThreats(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight threats
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showControlledArea}
                  onChange={(event) => setShowControlledArea(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight controlled area
              </label>
            </div>
            {isViewingPast ? (
              <span className="text-xs text-slate-500">Viewing move {viewPly}/{moveRows.length}</span>
            ) : (
              <span className="text-xs text-slate-500">Live</span>
            )}
          </div>
          <div ref={boardContainerRef} className="flex w-full items-center justify-center overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm" style={{ maxWidth: boardSize + 8 }}>
              <Chessboard
                position={normalizedDisplayFen}
                boardOrientation="white"
                showBoardNotation
                {...CHESSBOARD_THEME}
                onPieceDrop={(src: Square, dst: Square) => {
                  if (!canMove) return false
                  try {
                    if (isPromotionMove(normalizedDisplayFen, src, dst)) {
                      setPendingPromotion({ from: src, to: dst, fen: normalizedDisplayFen })
                      return false
                    }
                    const test = new Chess(normalizedDisplayFen || START_FEN)
                    const move = test.move({ from: src, to: dst })
                    if (!move) return false
                    void onDrop(src, dst, normalizedDisplayFen)
                    return true
                  } catch {
                    return false
                  }
                }}
                onSquareClick={(square: Square) => {
                  if (!showLegalMoves) return
                  setSelectedSquare((prev) => (prev === square ? null : square))
                }}
                boardWidth={boardSize}
                arePiecesDraggable={canMove}
                customSquareStyles={customSquareStyles}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(bottomPlayer || null, bottomIsWhite ? currentTurn === 'w' : currentTurn === 'b', 'You')}
          </div>
        </div>

        <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:w-[360px] lg:shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
          </div>
          <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold text-slate-600">Opening</div>
            <div className="text-sm text-slate-800">{opening?.name ?? 'Unknown'}</div>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600">Engine</div>
              <span className="text-[11px] text-slate-500">{isReady ? 'ready' : 'loading'}</span>
            </div>
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="local-engine-skill" className="text-xs text-slate-600">Opponent skill</label>
                <span className="text-xs font-semibold text-slate-700">Level {skillLevel}</span>
              </div>
              <input
                id="local-engine-skill"
                type="range"
                min={0}
                max={20}
                step={1}
                value={skillLevel}
                onChange={(event) => setSkillLevel(Number(event.target.value))}
                aria-label="Stockfish local opponent skill level"
                className="w-full"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>0 · ~800-900</span>
                <span>20 · Grandmaster</span>
              </div>
              <div className="mt-1 text-xs text-slate-600">Approximate Elo: {skillLevelToEloLabel(skillLevel)}</div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Evaluation</div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${evalPercent}%` }} />
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Top hints <span className="text-xs text-slate-500">(used: {hintCount})</span></div>
              {!showHintsVisible ? (
                <div className="flex">
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      const nextPly = moveRows.length + 1
                      lastShownPlyRef.current = nextPly
                      setShowHintsVisible(true)
                      setHintCount((c) => c + 1)
                      setHintedPlys((prev) => Array.from(new Set([...prev, nextPly])))
                    }}
                  >
                    Show hints
                  </button>
                </div>
              ) : (
                <TopHintsList hintMoves={hintMoves} onHoverOrClick={(uci) => setHoveredHintUci(uci)} />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {moveHistoryRowsNewestFirst.length ? (
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="w-10 py-2">#</th>
                    <th className="py-2">White</th>
                    <th className="py-2">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {moveHistoryRowsNewestFirst.map((row) => {
                    const whitePly = (row.moveNumber * 2) - 1
                    const blackPly = row.moveNumber * 2
                    const whiteHint = hintedPlys.includes(whitePly)
                    const blackHint = hintedPlys.includes(blackPly)
                    return (
                      <tr key={row.moveNumber} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-xs text-slate-500">{row.moveNumber}.</td>
                        <td className={`py-2 font-medium ${whiteHint ? 'text-purple-600' : ''}`}>
                          {row.white ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(whitePly)}
                            >
                              <span>{row.white}</span>
                              {whiteHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                        <td className={`py-2 font-medium ${blackHint ? 'text-purple-600' : ''}`}>
                          {row.black ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(blackPly)}
                            >
                              <span>{row.black}</span>
                              {blackHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">No moves yet.</div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Game: local
          </div>
        </aside>

        <ChessTutorPanel
          analysis={tutorAnalysis}
          modelLabel={tutorModel}
          loading={tutorLoading}
          error={tutorError}
          onAnalyze={() => { void handleAnalyzeGameForMe() }}
        />
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
  )
}
