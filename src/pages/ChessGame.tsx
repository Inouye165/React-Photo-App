import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { abortGame, fetchGame, fetchGameMembers, makeMove, restartGame } from '../api/games'
import { analyzeGameForMe, ensureStoryAudio, getStoryAudioSetupStatus, isStoryAudioPrecomputedOnlyModeEnabled, preloadStoryAudioManifest, type ChessTutorAnalysis } from '../api/chessTutor'
import { createDirectorScriptForPage, type StoryDirectorAction, type StoryHighlightTone } from '../data/storyTimeline'
import ChessTutorStudio from '../components/chess/tutor/ChessTutorStudio'
import Toast from '../components/Toast'
import type { GameMemberProfile, GameRow } from '../api/games'
import { supabase } from '../supabaseClient'
import { useGameRealtime } from '../hooks/useGameRealtime'
import { useAuth } from '../contexts/AuthContext'
import { useStockfish } from '../hooks/useStockfish'

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

function parseInitialTutorTab(search: string): TutorTab | undefined {
  const value = new URLSearchParams(search).get('tab')
  if (value === 'analyze' || value === 'lesson' || value === 'history') {
    return value
  }
  return undefined
}

function shouldOpenStoryMode(search: string): boolean {
  const value = new URLSearchParams(search).get('story')
  return value === '1' || value === 'true'
}

function shouldOpenTutorFullscreen(search: string): boolean {
  const value = new URLSearchParams(search).get('tutor')
  return value === '1' || value === 'true'
}

function parseInitialStoryId(search: string): string | undefined {
  const value = new URLSearchParams(search).get('storyId')
  return value?.trim() || undefined
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
const CHESS_STORY_TTS_VOICE = 'shimmer'
const STORY_MANUAL_NARRATION_STORAGE_KEY = 'chess-story-manual-narration'
type ChessStoryAudioSlug = Parameters<typeof preloadStoryAudioManifest>[0]
type ChessStoryOption = {
  id: string
  title: string
  pdfUrl: string
  audioSlug: ChessStoryAudioSlug
}

const CHESS_STORIES: ChessStoryOption[] = [
  {
    id: 'architect-of-squares',
    title: 'The Architect of Squares',
    pdfUrl: String(import.meta.env.VITE_CHESS_STORY_PDF_URL || DEFAULT_CHESS_STORY_PDF_URL).trim() || DEFAULT_CHESS_STORY_PDF_URL,
    audioSlug: 'architect-of-squares',
  },
]

const NARRATION_FALLBACK_WORDS_PER_SECOND = 2.7
const STORY_DIRECTOR_SYNC_INTERVAL_MS = 250
const STORY_STALL_RECOVERY_DELAY_MS = 2000
const STORY_PROGRESS_STORAGE_PREFIX = 'chess-story-progress'
const STORY_PROGRESS_STORAGE_VERSION = 1
const STORY_PDF_MOBILE_SCALE_BOOST = 1.22
const STORY_AUDIO_PAGE_CACHE_MAX_ENTRIES = 64

type WakeLockSentinelLike = {
  released: boolean
  release: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void, options?: AddEventListenerOptions | boolean) => void
}

type StoryProgressSnapshot = {
  version: number
  storyId: string
  page: number
  currentTime: number
  updatedAt: string
}

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

type StoryHighlightPreference = 'scripted' | StoryHighlightTone | 'neon'
type StoryHighlightBorderPreference = 'black' | 'white' | 'yellow' | 'blue' | 'royal' | 'red' | 'neon'

function getHighlightStyle(
  tone: StoryHighlightTone | 'neon' | undefined,
  borderPreference: StoryHighlightBorderPreference,
): React.CSSProperties {
  const styleByTone: Record<StoryHighlightTone | 'neon', { fill: string; ring: string; glow: string }> = {
    yellow: {
      fill: 'rgba(250, 204, 21, 0.86)',
      ring: 'rgba(120, 53, 15, 0.96)',
      glow: 'rgba(250, 204, 21, 0.95)',
    },
    blue: {
      fill: 'rgba(125, 211, 252, 0.86)',
      ring: 'rgba(12, 74, 110, 0.96)',
      glow: 'rgba(56, 189, 248, 0.9)',
    },
    royal: {
      fill: 'rgba(217, 70, 239, 0.84)',
      ring: 'rgba(112, 26, 117, 0.96)',
      glow: 'rgba(217, 70, 239, 0.9)',
    },
    red: {
      fill: 'rgba(248, 113, 113, 0.84)',
      ring: 'rgba(127, 29, 29, 0.96)',
      glow: 'rgba(248, 113, 113, 0.9)',
    },
    neon: {
      fill: 'rgba(34, 211, 238, 0.9)',
      ring: 'rgba(6, 182, 212, 0.98)',
      glow: 'rgba(34, 211, 238, 0.98)',
    },
  }

  const borderByPreference: Record<StoryHighlightBorderPreference, string> = {
    black: 'rgba(0, 0, 0, 0.98)',
    white: 'rgba(255, 255, 255, 0.98)',
    yellow: 'rgba(250, 204, 21, 0.98)',
    blue: 'rgba(56, 189, 248, 0.98)',
    royal: 'rgba(217, 70, 239, 0.98)',
    red: 'rgba(248, 113, 113, 0.98)',
    neon: 'rgba(34, 211, 238, 0.99)',
  }

  const resolved = styleByTone[tone || 'yellow']
  const resolvedBorder = borderByPreference[borderPreference]
  return {
    backgroundColor: resolved.fill,
    boxShadow: `inset 0 0 0 4px ${resolvedBorder || resolved.ring}, inset 0 0 0 1px rgba(255, 255, 255, 0.85), 0 0 16px ${resolved.glow}`,
    borderRadius: 2,
    filter: 'saturate(1.22) contrast(1.14)',
    animation: 'shimmer 1.35s ease-in-out infinite',
  }
}

function resolveStoryHighlightTone(
  actionTone: StoryHighlightTone | undefined,
  preference: StoryHighlightPreference,
): StoryHighlightTone | 'neon' | undefined {
  if (preference === 'scripted') return actionTone
  return preference
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

function resolveDirectorStateAtTime(
  actions: StoryDirectorAction[],
  timeSeconds: number,
  highlightPreference: StoryHighlightPreference = 'scripted',
  borderPreference: StoryHighlightBorderPreference = 'black',
): DirectorResolvedState {
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
        accumulator[square] = getHighlightStyle(
          resolveStoryHighlightTone(action.tone, highlightPreference),
          borderPreference,
        )
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
  storyTitle,
  storyAudioSlug,
}: {
  open: boolean
  onClose: () => void
  pdfUrl: string
  storyTitle: string
  storyAudioSlug: ChessStoryAudioSlug
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageContainerRef = useRef<HTMLDivElement | null>(null)
  const narrationTokenRef = useRef(0)
  const pageTextCacheRef = useRef<Map<number, string>>(new Map())
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const activeAudioObjectUrlRef = useRef<string | null>(null)
  const activeSpeechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const speechTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speechStartMsRef = useRef<number>(0)
  const storyChessRef = useRef(new Chess())
  const pageActionsRef = useRef<StoryDirectorAction[]>([])
  const lastTriggeredActionIndexRef = useRef<number>(-1)
  const lastDirectorSyncAtRef = useRef<number>(0)
  const lastAudioTimeRef = useRef<number>(0)
  const preservePausedAudioRef = useRef(false)
  const pausedAudioPageRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const wakeLockRequestInFlightRef = useRef<Promise<void> | null>(null)
  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stallRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefetchedStoryAudioKeysRef = useRef<Set<string>>(new Set())
  const storyAudioPageCacheRef = useRef<Map<string, Awaited<ReturnType<typeof ensureStoryAudio>>>>(new Map())
  const stallRecoveryInFlightRef = useRef(false)
  const resumePromptedRef = useRef(false)
  const pendingResumeRef = useRef<{ page: number; currentTime: number } | null>(null)
  const lastPersistedProgressRef = useRef<{ page: number; timeBucket: number } | null>(null)

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [isNarrating, setIsNarrating] = useState(false)
  const [autoTurnPages, setAutoTurnPages] = useState(true)
  const [manualNarration, setManualNarration] = useState('')
  const [audioSetupWarnings, setAudioSetupWarnings] = useState<string[]>([])
  const [storyHighlightPreference, setStoryHighlightPreference] = useState<StoryHighlightPreference>('blue')
  const [storyHighlightBorderPreference, setStoryHighlightBorderPreference] = useState<StoryHighlightBorderPreference>('black')
  const [boardPosition, setBoardPosition] = useState(() => new Chess().fen())
  const [customSquareStyles, setCustomSquareStyles] = useState<Record<string, React.CSSProperties>>({})
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [usingBrowserNarration, setUsingBrowserNarration] = useState(false)
  const [showTimelinePanel, setShowTimelinePanel] = useState(true)
  const [timelineBoardWidth, setTimelineBoardWidth] = useState(240)
  const [activeNarrationText, setActiveNarrationText] = useState('')
  const [activeNarrationSource, setActiveNarrationSource] = useState<NarrationSource>('none')
  const [pageTextOverlayItems, setPageTextOverlayItems] = useState<PdfTextOverlayItem[]>([])
  const [renderedPageSize, setRenderedPageSize] = useState({ width: 0, height: 0 })
  const [hasExtractablePdfText, setHasExtractablePdfText] = useState<boolean | null>(null)
  const isStoryAudioPrecomputedOnly = isStoryAudioPrecomputedOnlyModeEnabled()
  const storyHighlightPreferenceRef = useRef<StoryHighlightPreference>('blue')
  const storyHighlightBorderPreferenceRef = useRef<StoryHighlightBorderPreference>('black')

  const manualNarrationPages = useMemo(() => splitManualNarrationIntoPages(manualNarration), [manualNarration])
  const storyProgressStorageKey = useMemo(
    () => `${STORY_PROGRESS_STORAGE_PREFIX}:${storyAudioSlug}:${pdfUrl}`,
    [pdfUrl, storyAudioSlug],
  )
  const storyProgressId = useMemo(() => `${storyAudioSlug}:${pdfUrl}`, [pdfUrl, storyAudioSlug])
  const narrationWords = useMemo(
    () => activeNarrationText.split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 0),
    [activeNarrationText],
  )
  const woodTexturePieces = useWoodTexturePieceSet()
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

  const clearStallRecoveryTimer = useCallback(() => {
    if (!stallRecoveryTimerRef.current) return
    clearTimeout(stallRecoveryTimerRef.current)
    stallRecoveryTimerRef.current = null
  }, [])

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (!sentinel) return
    try {
      await sentinel.release()
    } catch {
      // Ignore wake lock release failures.
    }
  }, [])

  const acquireWakeLock = useCallback(async () => {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') return
    if (document.visibilityState !== 'visible') return
    if (!open || !isNarrating) return
    if (wakeLockRef.current && !wakeLockRef.current.released) return
    if (wakeLockRequestInFlightRef.current) {
      await wakeLockRequestInFlightRef.current
      return
    }

    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: {
            request: (type: 'screen') => Promise<WakeLockSentinelLike>
          }
        }
        if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') return

        const sentinel = await nav.wakeLock.request('screen')
        wakeLockRef.current = sentinel
        sentinel.addEventListener?.('release', () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null
          }
        })
      } catch {
        // Ignore wake lock acquisition failures; narration can continue without it.
      }
    }

    wakeLockRequestInFlightRef.current = requestWakeLock().finally(() => {
      wakeLockRequestInFlightRef.current = null
    })
    await wakeLockRequestInFlightRef.current
  }, [open, isNarrating])

  const syncDirectorToTime = useCallback((timeSeconds: number, force = false) => {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return

    if (!force) {
      const now = Date.now()
      if (now - lastDirectorSyncAtRef.current < STORY_DIRECTOR_SYNC_INTERVAL_MS) return
      lastDirectorSyncAtRef.current = now
    }

    setAudioCurrentTime(timeSeconds)
    const actions = pageActionsRef.current
    if (!actions.length) {
      lastAudioTimeRef.current = timeSeconds
      return
    }

    if (timeSeconds + 0.01 < lastAudioTimeRef.current) {
      const resolved = resolveDirectorStateAtTime(
        actions,
        timeSeconds,
        storyHighlightPreferenceRef.current,
        storyHighlightBorderPreferenceRef.current,
      )
      storyChessRef.current = resolved.chess
      setBoardPosition(resolved.chess.fen())
      setCustomSquareStyles(resolved.styles)
      setActiveActionLabel(resolved.label)
      lastTriggeredActionIndexRef.current = resolved.lastIndex
      lastAudioTimeRef.current = timeSeconds
      return
    }

    for (let index = lastTriggeredActionIndexRef.current + 1; index < actions.length; index += 1) {
      const action = actions[index]
      if (timeSeconds < action.timestamp) break

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
          accumulator[square] = getHighlightStyle(
            resolveStoryHighlightTone(action.tone, storyHighlightPreferenceRef.current),
            storyHighlightBorderPreferenceRef.current,
          )
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
    }

    lastAudioTimeRef.current = timeSeconds
  }, [])

  useEffect(() => {
    storyHighlightPreferenceRef.current = storyHighlightPreference
    if (open) {
      syncDirectorToTime(lastAudioTimeRef.current, true)
    }
  }, [storyHighlightPreference, open, syncDirectorToTime])

  useEffect(() => {
    storyHighlightBorderPreferenceRef.current = storyHighlightBorderPreference
    if (open) {
      syncDirectorToTime(lastAudioTimeRef.current, true)
    }
  }, [storyHighlightBorderPreference, open, syncDirectorToTime])

  const applyPendingResumeToAudio = useCallback((audio: HTMLAudioElement, pageNumber: number) => {
    const pending = pendingResumeRef.current
    if (!pending || pending.page !== pageNumber) return
    if (!Number.isFinite(pending.currentTime) || pending.currentTime <= 0) {
      pendingResumeRef.current = null
      return
    }

    const applyCurrentTime = () => {
      try {
        audio.currentTime = pending.currentTime
      } catch {
        return
      }
      syncDirectorToTime(pending.currentTime, true)
      pendingResumeRef.current = null
    }

    if (audio.readyState >= 1) {
      applyCurrentTime()
      return
    }

    audio.addEventListener('loadedmetadata', applyCurrentTime, { once: true })
  }, [syncDirectorToTime])

  const recoverFromAudioStall = useCallback(async (audio: HTMLAudioElement, reason: string) => {
    if (stallRecoveryInFlightRef.current) return
    if (!isNarrating || audio.paused) return

    stallRecoveryInFlightRef.current = true
    const resumeTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0

    try {
      audio.load()
    } catch {
      // Ignore reload failures and still attempt play.
    }

    if (resumeTime > 0) {
      const seekToResumePoint = () => {
        try {
          audio.currentTime = Math.max(0, resumeTime - 0.05)
        } catch {
          // Ignore seek failures.
        }
      }
      audio.addEventListener('loadedmetadata', seekToResumePoint, { once: true })
    }

    try {
      await audio.play()
      if (import.meta.env.DEV) {
        console.info('[story-audio/modal] stall-recovery-succeeded', {
          reason,
          resumeTime,
        })
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.info('[story-audio/modal] stall-recovery-failed', {
          reason,
          resumeTime,
          errorName: (error as { name?: unknown })?.name,
          errorMessage: (error as { message?: unknown })?.message,
        })
      }
    } finally {
      stallRecoveryInFlightRef.current = false
    }
  }, [isNarrating])

  const scheduleAudioStallRecovery = useCallback((audio: HTMLAudioElement, reason: string) => {
    clearStallRecoveryTimer()
    if (!isNarrating || audio.paused) return
    stallRecoveryTimerRef.current = setTimeout(() => {
      stallRecoveryTimerRef.current = null
      if (!isNarrating || audio.paused) return
      void recoverFromAudioStall(audio, reason)
    }, STORY_STALL_RECOVERY_DELAY_MS)
  }, [clearStallRecoveryTimer, isNarrating, recoverFromAudioStall])

  const clearSpeechTimer = useCallback(() => {
    if (!speechTimerRef.current) return
    clearInterval(speechTimerRef.current)
    speechTimerRef.current = null
  }, [])

  const stopSpeechNarration = useCallback(() => {
    clearSpeechTimer()
    speechStartMsRef.current = 0
    activeSpeechUtteranceRef.current = null

    if (typeof window !== 'undefined' && window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // Ignore cancellation failures.
      }
    }
  }, [clearSpeechTimer])

  const startSpeechNarration = useCallback((input: {
    text: string
    onEnd: () => void
    onError: () => void
  }): boolean => {
    if (typeof window === 'undefined') return false
    const synth = window.speechSynthesis
    const UtteranceCtor = window.SpeechSynthesisUtterance
    if (!synth || typeof synth.speak !== 'function' || !UtteranceCtor) return false

    stopSpeechNarration()

    const utterance = new UtteranceCtor(input.text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.lang = 'en-US'

    const voices = typeof synth.getVoices === 'function' ? synth.getVoices() : []
    const preferredVoice = voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith('en'))
    if (preferredVoice) {
      utterance.voice = preferredVoice
      utterance.lang = preferredVoice.lang || utterance.lang
    }

    const wordCount = input.text.split(/\s+/).map((word) => word.trim()).filter((word) => word.length > 0).length
    const estimatedDurationSeconds = Math.max(1, wordCount / NARRATION_FALLBACK_WORDS_PER_SECOND)
    setAudioDuration(estimatedDurationSeconds)

    utterance.onend = () => {
      clearSpeechTimer()
      speechStartMsRef.current = 0
      activeSpeechUtteranceRef.current = null
      input.onEnd()
    }

    utterance.onerror = () => {
      clearSpeechTimer()
      speechStartMsRef.current = 0
      activeSpeechUtteranceRef.current = null
      input.onError()
    }

    activeSpeechUtteranceRef.current = utterance
    speechStartMsRef.current = Date.now()

    speechTimerRef.current = setInterval(() => {
      const elapsedSeconds = Math.max(0, (Date.now() - speechStartMsRef.current) / 1000)
      syncDirectorToTime(elapsedSeconds, true)
    }, STORY_DIRECTOR_SYNC_INTERVAL_MS)

    try {
      synth.speak(utterance)
      return true
    } catch {
      clearSpeechTimer()
      speechStartMsRef.current = 0
      activeSpeechUtteranceRef.current = null
      return false
    }
  }, [clearSpeechTimer, stopSpeechNarration, syncDirectorToTime])

  const stopNarration = useCallback(() => {
    preservePausedAudioRef.current = false
    pausedAudioPageRef.current = null
    clearStallRecoveryTimer()
    setIsNarrating(false)
    setAudioCurrentTime(0)
    setAudioDuration(0)
    setUsingBrowserNarration(false)
    setActiveNarrationText('')
    setActiveNarrationSource('none')
    void releaseWakeLock()
    stopSpeechNarration()
    stopActiveAudio()
  }, [clearStallRecoveryTimer, releaseWakeLock, stopActiveAudio, stopSpeechNarration])

  const primeNarrationPlayback = useCallback(() => {
    if (typeof window === 'undefined') return

    const AudioContextCtor = window.AudioContext
      || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) return

    try {
      const context = new AudioContextCtor()
      if (context.state === 'suspended') {
        void context.resume().catch(() => {
          // Ignore unlock failures; playback flow handles retries.
        })
      }
      // Close immediately to avoid leaking contexts.
      void context.close().catch(() => {
        // Ignore cleanup failures.
      })
    } catch {
      // Ignore unlock failures; playback flow handles retries.
    }
  }, [])

  const logStoryAudio = useCallback((event: string, details?: Record<string, unknown>) => {
    const payload = details || {}
    console.info(`[story-audio/modal] ${event}`, {
      page: currentPage,
      totalPages,
      isNarrating,
      ...payload,
    })
  }, [currentPage, totalPages, isNarrating])

  const getAudioPlayErrorMessage = useCallback((error: unknown): string => {
    const name = String((error as { name?: unknown })?.name || '')
    if (name === 'NotAllowedError') {
      return 'Audio playback was blocked. Click play again to continue narration.'
    }
    return 'Audio playback failed for this page.'
  }, [])

  const handleNarrationToggle = useCallback(() => {
    if (isNarrating) {
      const activeAudio = activeAudioRef.current
      if (activeAudio) {
        preservePausedAudioRef.current = true
        pausedAudioPageRef.current = currentPage
        activeAudio.pause()
        setAudioCurrentTime(activeAudio.currentTime)
      }
      if (activeSpeechUtteranceRef.current) {
        stopSpeechNarration()
      }
      setIsNarrating(false)
      logStoryAudio('pause-clicked')
      return
    }

    primeNarrationPlayback()
    logStoryAudio('play-clicked')
    setIsNarrating(true)
  }, [isNarrating, currentPage, primeNarrationPlayback, logStoryAudio, stopSpeechNarration])

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

  const prefetchNarrationAudioForPage = useCallback(async (pageNumber: number) => {
    if (!open || !pdfDocument) return
    if (pageNumber <= 0 || pageNumber > totalPages) return

    const narration = await getNarrationForPage(pageNumber)
    const prefetchText = narration.text
    if (!prefetchText) {
      logStoryAudio('prefetch-skip-no-text', {
        prefetchPage: pageNumber,
        source: narration.source,
      })
      return
    }

    const prefetchCacheKey = `${storyAudioSlug}:${pageNumber}:${prefetchText}`
    if (storyAudioPageCacheRef.current.has(prefetchCacheKey)) {
      logStoryAudio('prefetch-skip-cached-result', {
        prefetchPage: pageNumber,
      })
      return
    }

    if (prefetchedStoryAudioKeysRef.current.has(prefetchCacheKey)) {
      logStoryAudio('prefetch-skip-already-prefetched', {
        prefetchPage: pageNumber,
      })
      return
    }

    prefetchedStoryAudioKeysRef.current.add(prefetchCacheKey)
    logStoryAudio('prefetch-start', {
      prefetchPage: pageNumber,
      source: narration.source,
      textLength: prefetchText.length,
    })

    try {
      const prefetchedAudio = await ensureStoryAudio({
        storySlug: storyAudioSlug,
        page: pageNumber,
        totalPages,
        text: prefetchText,
        voice: CHESS_STORY_TTS_VOICE,
      })

      storyAudioPageCacheRef.current.delete(prefetchCacheKey)
      storyAudioPageCacheRef.current.set(prefetchCacheKey, prefetchedAudio)
      if (storyAudioPageCacheRef.current.size > STORY_AUDIO_PAGE_CACHE_MAX_ENTRIES) {
        const oldestKey = storyAudioPageCacheRef.current.keys().next().value
        if (oldestKey) {
          storyAudioPageCacheRef.current.delete(oldestKey)
        }
      }

      logStoryAudio('prefetch-success', {
        prefetchPage: pageNumber,
        cached: prefetchedAudio.cached,
        source: prefetchedAudio.source,
      })
    } catch (error) {
      prefetchedStoryAudioKeysRef.current.delete(prefetchCacheKey)
      logStoryAudio('prefetch-failed', {
        prefetchPage: pageNumber,
        errorName: (error as { name?: unknown })?.name,
        errorMessage: (error as { message?: unknown })?.message,
      })
    }
  }, [open, pdfDocument, totalPages, getNarrationForPage, logStoryAudio, storyAudioSlug])

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
    if (!open) {
      resumePromptedRef.current = false
      return
    }
    if (!pdfDocument) return
    if (resumePromptedRef.current) return

    resumePromptedRef.current = true

    let rawSnapshot: string | null = null
    try {
      rawSnapshot = window.localStorage.getItem(storyProgressStorageKey)
    } catch {
      rawSnapshot = null
    }
    if (!rawSnapshot) return

    let parsed: StoryProgressSnapshot | null = null
    try {
      parsed = JSON.parse(rawSnapshot) as StoryProgressSnapshot
    } catch {
      parsed = null
    }
    if (!parsed || parsed.version !== STORY_PROGRESS_STORAGE_VERSION) return
    if (parsed.storyId !== storyProgressId) return

    const targetPage = Math.min(totalPages, Math.max(1, Number(parsed.page) || 1))
    const targetTime = Math.max(0, Number(parsed.currentTime) || 0)
    if (targetPage <= 1 && targetTime < 1) return

    let shouldResume = false
    try {
      shouldResume = typeof window.confirm === 'function'
        ? window.confirm(`Resume narration from page ${targetPage} at ${formatAudioTime(targetTime)}?`)
        : false
    } catch {
      shouldResume = false
    }

    if (!shouldResume) return

    pendingResumeRef.current = {
      page: targetPage,
      currentTime: targetTime,
    }
    setCurrentPage(targetPage)
    setAudioCurrentTime(targetTime)
    syncDirectorToTime(targetTime, true)
  }, [open, pdfDocument, storyProgressStorageKey, storyProgressId, totalPages, syncDirectorToTime])

  useEffect(() => {
    if (!open) return

    const timeBucket = Math.floor(Math.max(0, audioCurrentTime) * 4)
    const lastPersisted = lastPersistedProgressRef.current
    if (lastPersisted && lastPersisted.page === currentPage && lastPersisted.timeBucket === timeBucket) {
      return
    }

    const snapshot: StoryProgressSnapshot = {
      version: STORY_PROGRESS_STORAGE_VERSION,
      storyId: storyProgressId,
      page: currentPage,
      currentTime: Math.max(0, audioCurrentTime),
      updatedAt: new Date().toISOString(),
    }

    try {
      window.localStorage.setItem(storyProgressStorageKey, JSON.stringify(snapshot))
      lastPersistedProgressRef.current = {
        page: currentPage,
        timeBucket,
      }
    } catch {
      // Ignore storage write failures.
    }
  }, [open, currentPage, audioCurrentTime, storyProgressStorageKey, storyProgressId])

  useEffect(() => {
    if (!open || !isNarrating) {
      void releaseWakeLock()
      return
    }

    void acquireWakeLock()
  }, [open, isNarrating, acquireWakeLock, releaseWakeLock])

  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibilityChange = () => {
      if (!open || !isNarrating) return
      if (document.visibilityState === 'visible') {
        void acquireWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [open, isNarrating, acquireWakeLock])

  useEffect(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current)
      watchdogTimerRef.current = null
    }

    if (!open || !isNarrating) return

    const tick = () => {
      const audio = activeAudioRef.current
      if (!audio || audio.paused) return
      syncDirectorToTime(audio.currentTime, true)
    }

    watchdogTimerRef.current = setInterval(tick, STORY_DIRECTOR_SYNC_INTERVAL_MS)
    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current)
        watchdogTimerRef.current = null
      }
    }
  }, [open, isNarrating, syncDirectorToTime])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    void preloadStoryAudioManifest(storyAudioSlug).catch(() => {
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
  }, [open, storyAudioSlug])

  useEffect(() => {
    if (!open) return
    if (pausedAudioPageRef.current != null && pausedAudioPageRef.current !== currentPage) {
      preservePausedAudioRef.current = false
      pausedAudioPageRef.current = null
      stopActiveAudio()
      stopSpeechNarration()
    }
    resetDirectorForPage(currentPage)
  }, [open, currentPage, resetDirectorForPage, stopActiveAudio, stopSpeechNarration])

  useEffect(() => {
    if (!open) {
      stopNarration()
      prefetchedStoryAudioKeysRef.current.clear()
      storyAudioPageCacheRef.current.clear()
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
    prefetchedStoryAudioKeysRef.current.clear()
    storyAudioPageCacheRef.current.clear()

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
    let activeRenderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null

    const renderPage = async () => {
      const maxPage = Math.max(1, pdfDocument.numPages || 1)
      if (currentPage > maxPage) {
        if (!cancelled) {
          setCurrentPage(maxPage)
        }
        return
      }

      try {
        if (!cancelled) {
          setLoadError(null)
        }

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
        const isNarrowViewport = typeof window !== 'undefined' && window.innerWidth <= 640
        const mobileScaleBoost = isNarrowViewport ? STORY_PDF_MOBILE_SCALE_BOOST : 1
        const scale = Math.max(0.2, Math.min(widthScale, heightScale) * mobileScaleBoost)
        const viewport = page.getViewport({ scale })

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        setRenderedPageSize({ width: canvas.width, height: canvas.height })

        activeRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        })
        await activeRenderTask.promise
        activeRenderTask = null

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
      } catch (error) {
        activeRenderTask = null
        if (cancelled) return

        const errorName = String((error as { name?: unknown })?.name ?? '')
        const errorMessage = String((error as { message?: unknown })?.message ?? '')
        const isCancelledRender = errorName === 'RenderingCancelledException'
          || /cancelled|canceled/i.test(errorMessage)
          || /same canvas/i.test(errorMessage)

        if (isCancelledRender) {
          return
        }

        const invalidPageMatch = /Invalid page request/i.test(errorMessage)
        if (invalidPageMatch) {
          const fallbackPage = Math.max(1, Math.min(currentPage, Math.max(1, pdfDocument.numPages || 1)))
          if (fallbackPage !== currentPage) {
            setCurrentPage(fallbackPage)
            return
          }
        }

        console.warn('[story/pdf-render] Failed to render page', {
          page: currentPage,
          totalPages: Math.max(1, pdfDocument.numPages || 1),
          errorName,
          errorMessage,
        })

        if (!cancelled) {
          setLoadError('Unable to render this page of the story.')
          setPageTextOverlayItems([])
        }
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      try {
        activeRenderTask?.cancel?.()
      } catch {}
      activeRenderTask = null
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
      stopSpeechNarration()
      resetDirectorForPage(currentPage)
    }

    preservePausedAudioRef.current = false

    const playPageAudio = async () => {
      logStoryAudio('play-page-audio-start')
      const bindAudioEvents = (audio: HTMLAudioElement, fallbackNarrationText?: string) => {
        const onEnded = () => {
          clearStallRecoveryTimer()
          if (cancelled || narrationTokenRef.current !== narrationToken) return
          if (!autoTurnPages) return

          if (currentPage >= totalPages) {
            setIsNarrating(false)
            return
          }

          setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))
        }
        const onError = () => {
          clearStallRecoveryTimer()
          const mediaError = audio.error
          logStoryAudio('audio-element-error', {
            mediaErrorCode: mediaError?.code,
            mediaErrorMessage: mediaError?.message,
            networkState: audio.networkState,
            readyState: audio.readyState,
            currentSrc: audio.currentSrc,
          })
          if (cancelled || narrationTokenRef.current !== narrationToken) return

          if (!isStoryAudioPrecomputedOnly && fallbackNarrationText) {
            stopActiveAudio()
            const started = startSpeechNarration({
              text: fallbackNarrationText,
              onEnd: () => {
                if (cancelled || narrationTokenRef.current !== narrationToken) return
                if (!autoTurnPages) return
                if (currentPage >= totalPages) {
                  setIsNarrating(false)
                  return
                }
                setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))
              },
              onError: () => {
                if (cancelled || narrationTokenRef.current !== narrationToken) return
                setIsNarrating(false)
                setLoadError('Browser narration failed for this page.')
              },
            })

            if (started) {
              setUsingBrowserNarration(true)
              setLoadError(null)
              return
            }
          }

          setIsNarrating(false)
          setLoadError(
            isStoryAudioPrecomputedOnly
              ? 'Precomputed story audio is unavailable for this page. Ask an admin to run `npm run story:precompute-audio-assets` and redeploy.'
              : 'Audio playback failed for this page.',
          )
        }

        const onSeeked = () => {
          syncDirectorToTime(audio.currentTime, true)
        }

        const onLoadedMetadata = () => {
          logStoryAudio('audio-loaded-metadata', {
            duration: Number.isFinite(audio.duration) ? audio.duration : null,
            currentSrc: audio.currentSrc,
          })
          setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
        }

        const onCanPlay = () => {
          clearStallRecoveryTimer()
          logStoryAudio('audio-canplay', {
            currentSrc: audio.currentSrc,
            readyState: audio.readyState,
          })
        }

        const onStalled = () => {
          logStoryAudio('audio-stalled', {
            currentSrc: audio.currentSrc,
            networkState: audio.networkState,
          })
          scheduleAudioStallRecovery(audio, 'stalled')
        }

        const onWaiting = () => {
          logStoryAudio('audio-waiting', {
            currentSrc: audio.currentSrc,
            networkState: audio.networkState,
          })
          scheduleAudioStallRecovery(audio, 'waiting')
        }

        const onSuspend = () => {
          logStoryAudio('audio-suspend', {
            currentSrc: audio.currentSrc,
            networkState: audio.networkState,
          })
          scheduleAudioStallRecovery(audio, 'suspend')
        }

        const onPlaying = () => {
          clearStallRecoveryTimer()
        }

        const onTimeUpdate = () => {
          if (cancelled || narrationTokenRef.current !== narrationToken) return
          clearStallRecoveryTimer()
          syncDirectorToTime(audio.currentTime)
        }

        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        audio.addEventListener('loadedmetadata', onLoadedMetadata)
        audio.addEventListener('seeked', onSeeked)
        audio.addEventListener('timeupdate', onTimeUpdate)
        audio.addEventListener('canplay', onCanPlay)
        audio.addEventListener('stalled', onStalled)
        audio.addEventListener('waiting', onWaiting)
        audio.addEventListener('suspend', onSuspend)
        audio.addEventListener('playing', onPlaying)

        if (Number.isFinite(audio.duration)) {
          setAudioDuration(audio.duration)
        }

        return () => {
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onError)
          audio.removeEventListener('loadedmetadata', onLoadedMetadata)
          audio.removeEventListener('seeked', onSeeked)
          audio.removeEventListener('timeupdate', onTimeUpdate)
          audio.removeEventListener('canplay', onCanPlay)
          audio.removeEventListener('stalled', onStalled)
          audio.removeEventListener('waiting', onWaiting)
          audio.removeEventListener('suspend', onSuspend)
          audio.removeEventListener('playing', onPlaying)
        }
      }

      if (canResumePausedAudio && activeAudioRef.current) {
        const audio = activeAudioRef.current
        logStoryAudio('resuming-paused-audio', {
          currentSrc: audio.currentSrc,
          currentTime: audio.currentTime,
        })
        removeAudioListeners = bindAudioEvents(audio, activeNarrationText)
        applyPendingResumeToAudio(audio, currentPage)
        try {
          await audio.play()
          logStoryAudio('resume-play-succeeded')
        } catch (error) {
          logStoryAudio('resume-play-failed', {
            errorName: (error as { name?: unknown })?.name,
            errorMessage: (error as { message?: unknown })?.message,
          })
          if (!cancelled) {
            setIsNarrating(false)
            setLoadError(getAudioPlayErrorMessage(error))
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
      setUsingBrowserNarration(false)
      setLoadError(null)

      const startBrowserNarrationFallback = (): boolean => {
        const started = startSpeechNarration({
          text,
          onEnd: () => {
            if (cancelled || narrationTokenRef.current !== narrationToken) return
            if (!autoTurnPages) return
            if (currentPage >= totalPages) {
              setIsNarrating(false)
              return
            }
            setCurrentPage((previousPage) => Math.min(totalPages, previousPage + 1))
          },
          onError: () => {
            if (cancelled || narrationTokenRef.current !== narrationToken) return
            setIsNarrating(false)
            setLoadError('Browser narration failed for this page.')
          },
        })

        if (started) {
          setUsingBrowserNarration(true)
          setLoadError(null)
          return true
        }

        setUsingBrowserNarration(false)
        setIsNarrating(false)
        setLoadError('Browser speech narration is unavailable on this device.')
        return false
      }

      let audioSourceUrl = ''
      let createdObjectUrl: string | null = null
      const pageAudioCacheKey = `${storyAudioSlug}:${currentPage}:${text}`

      try {
        let ensuredAudio = storyAudioPageCacheRef.current.get(pageAudioCacheKey)

        if (!ensuredAudio) {
          logStoryAudio('ensure-story-audio-request', {
            source: narration.source,
            textLength: text.length,
          })
          ensuredAudio = await ensureStoryAudio({
            storySlug: storyAudioSlug,
            page: currentPage,
            totalPages,
            text,
            voice: CHESS_STORY_TTS_VOICE,
          })

          storyAudioPageCacheRef.current.delete(pageAudioCacheKey)
          storyAudioPageCacheRef.current.set(pageAudioCacheKey, ensuredAudio)
          if (storyAudioPageCacheRef.current.size > STORY_AUDIO_PAGE_CACHE_MAX_ENTRIES) {
            const oldestKey = storyAudioPageCacheRef.current.keys().next().value
            if (oldestKey) {
              storyAudioPageCacheRef.current.delete(oldestKey)
            }
          }
        } else {
          logStoryAudio('ensure-story-audio-skip-reused-cache', {
            source: ensuredAudio.source,
            cached: ensuredAudio.cached,
            textLength: text.length,
          })
        }

        logStoryAudio('ensure-story-audio-response', {
          cached: ensuredAudio.cached,
          source: ensuredAudio.source,
          playbackMode: ensuredAudio.source === 'runtime-generated' ? 'generated-now' : 'loaded-existing',
          hasUrl: Boolean(ensuredAudio.url),
          hasAudioBase64: Boolean(ensuredAudio.audioBase64 && ensuredAudio.audioBase64.length > 0),
        })

        if (ensuredAudio.audioBase64 && ensuredAudio.audioBase64.length > 0) {
          createdObjectUrl = base64ToBlobUrl(ensuredAudio.audioBase64)
          audioSourceUrl = createdObjectUrl
        } else if (ensuredAudio.url) {
          audioSourceUrl = ensuredAudio.url
        }
      } catch (error) {
        logStoryAudio('ensure-story-audio-failed', {
          errorName: (error as { name?: unknown })?.name,
          errorMessage: (error as { message?: unknown })?.message,
        })
        if (cancelled || narrationTokenRef.current !== narrationToken) return

        const maybeStatus = Number((error as { status?: unknown })?.status || 0)
        const maybeMessage = String((error as { message?: unknown })?.message || '').toLowerCase()
        const isTtsUnavailable =
          maybeStatus === 503
          || maybeMessage.includes('tts is not available')
          || maybeMessage.includes('openai tts is not available')

        if (isTtsUnavailable) {
          startBrowserNarrationFallback()
          return
        }

        setUsingBrowserNarration(false)
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
      logStoryAudio('audio-instance-created', {
        audioSourceKind: createdObjectUrl ? 'blob' : 'url',
        audioSourcePreview: audioSourceUrl.slice(0, 160),
      })
      activeAudioRef.current = audio
      if (createdObjectUrl) {
        activeAudioObjectUrlRef.current = createdObjectUrl
      }

      removeAudioListeners = bindAudioEvents(audio, text)
      applyPendingResumeToAudio(audio, currentPage)
      setUsingBrowserNarration(false)

      try {
        await audio.play()
        logStoryAudio('play-succeeded')
        if (autoTurnPages && currentPage < totalPages) {
          void prefetchNarrationAudioForPage(currentPage + 1)
        }
      } catch (error) {
        logStoryAudio('play-failed', {
          errorName: (error as { name?: unknown })?.name,
          errorMessage: (error as { message?: unknown })?.message,
          currentSrc: audio.currentSrc,
          readyState: audio.readyState,
          networkState: audio.networkState,
        })
        if (cancelled || narrationTokenRef.current !== narrationToken) return

        if (!isStoryAudioPrecomputedOnly) {
          const startedFallback = startBrowserNarrationFallback()
          if (startedFallback) {
            return
          }
        }

        setIsNarrating(false)
        setLoadError(
          isStoryAudioPrecomputedOnly
            ? 'Precomputed story audio is unavailable for this page. Ask an admin to run `npm run story:precompute-audio-assets` and redeploy.'
            : getAudioPlayErrorMessage(error),
        )
      }
    }

    void playPageAudio()

    return () => {
      cancelled = true
      removeAudioListeners?.()
      clearStallRecoveryTimer()
      if (preservePausedAudioRef.current && pausedAudioPageRef.current === currentPage) {
        return
      }
      stopSpeechNarration()
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
    syncDirectorToTime,
    getAudioPlayErrorMessage,
    logStoryAudio,
    applyPendingResumeToAudio,
    scheduleAudioStallRecovery,
    clearStallRecoveryTimer,
    startSpeechNarration,
    stopSpeechNarration,
    prefetchNarrationAudioForPage,
    isStoryAudioPrecomputedOnly,
  ])

  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current)
        watchdogTimerRef.current = null
      }
      stopSpeechNarration()
      clearStallRecoveryTimer()
      void releaseWakeLock()
    }
  }, [clearStallRecoveryTimer, releaseWakeLock, stopSpeechNarration])

  useEffect(() => {
    if (!open) return
    const getTimelineBoardWidth = () => {
      if (typeof window === 'undefined') return 260
      const maxByViewport = Math.max(200, window.innerWidth - 64)
      return Math.min(320, maxByViewport)
    }

    setShowTimelinePanel(true)
    setTimelineBoardWidth(getTimelineBoardWidth())

    const onResize = () => {
      setTimelineBoardWidth(getTimelineBoardWidth())
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

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
    <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => { stopNarration(); onClose() }} role="dialog" aria-modal="true" aria-label="Chess story modal">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden border-0 bg-white p-3 shadow-2xl sm:p-4" style={CHESS_SAFE_AREA_STYLE} onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-700">{storyTitle}</div>
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
          <button
            type="button"
            onClick={() => setShowTimelinePanel((previousState) => !previousState)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:hidden"
          >
            {showTimelinePanel ? 'Hide timeline' : 'Show timeline'}
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Highlight
            <select
              value={storyHighlightPreference}
              onChange={(event) => setStoryHighlightPreference(event.target.value as StoryHighlightPreference)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
              aria-label="Story highlight color"
            >
              <option value="scripted">Scripted</option>
              <option value="blue">Blue</option>
              <option value="royal">Magenta</option>
              <option value="red">Red</option>
              <option value="yellow">Yellow</option>
              <option value="neon">Neon</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Border
            <select
              value={storyHighlightBorderPreference}
              onChange={(event) => setStoryHighlightBorderPreference(event.target.value as StoryHighlightBorderPreference)}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
              aria-label="Story highlight border color"
            >
              <option value="black">Black</option>
              <option value="white">White</option>
              <option value="blue">Blue</option>
              <option value="royal">Magenta</option>
              <option value="red">Red</option>
              <option value="yellow">Yellow</option>
              <option value="neon">Neon</option>
            </select>
          </label>
          <span className="text-xs text-slate-500">Page {currentPage}/{totalPages}</span>
          <span className="text-xs text-slate-500">Audio {formatAudioTime(audioCurrentTime)} / {formatAudioTime(audioDuration)}</span>
          <span className="text-xs text-slate-500">Source: {narrationSourceLabel(activeNarrationSource)}</span>
          {usingBrowserNarration ? <span className="text-xs text-slate-500">Using browser narration</span> : null}
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
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1">
            <div className={`${showTimelinePanel ? 'order-1 block' : 'order-1 hidden'} rounded-lg border border-slate-200 bg-white p-1.5 sm:p-2 lg:order-2 lg:block`}>
              <div className="mb-1 text-xs font-semibold text-slate-600">Story board timeline</div>
              <div className="mx-auto flex w-full justify-center">
                <div className="overflow-hidden rounded-xl ring-1 ring-slate-200 shadow-sm" style={{ width: timelineBoardWidth }}>
                  <Chessboard
                    id={`story-board-${currentPage}`}
                    position={boardPosition}
                    boardOrientation="white"
                    customPieces={woodTexturePieces}
                    arePiecesDraggable={false}
                    showBoardNotation={false}
                    customSquareStyles={customSquareStyles}
                    animationDuration={500}
                    boardWidth={timelineBoardWidth}
                    {...CHESSBOARD_THEME}
                  />
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-600">{activeActionLabel ? `Last cue: ${activeActionLabel}` : 'Waiting for cue...'}</div>
            </div>

            <div ref={pageContainerRef} className="order-2 min-h-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-1.5 sm:p-2 lg:order-1">
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

function InlineAnalysisResult({
  loading,
  error,
  analysis,
  modelLabel,
  tone = 'light',
}: {
  loading: boolean
  error: string | null
  analysis: ChessTutorAnalysis | null
  modelLabel: string
  tone?: 'light' | 'dark'
}) {
  const baseClass = tone === 'dark'
    ? 'mb-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200'
    : 'mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700'

  if (!loading && !error && !analysis) {
    return (
      <div className={baseClass}>
        <div className={`text-xs font-semibold ${tone === 'dark' ? 'text-slate-100' : 'text-slate-600'}`}>Analysis</div>
        <div className={`mt-1 ${tone === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>Run Analyze game to get a position summary, hints, and focus points.</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        <div className="text-xs font-semibold">Analysis</div>
        <div className="mt-1">Analyzing current position…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        <div className="text-xs font-semibold">Analysis failed</div>
        <div className="mt-1">{error}</div>
      </div>
    )
  }

  return (
    <div className={baseClass}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-xs font-semibold ${tone === 'dark' ? 'text-slate-100' : 'text-slate-700'}`}>Analysis</div>
        <span className={`text-[11px] ${tone === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>{modelLabel}</span>
      </div>
      <div className={`mt-1 ${tone === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>{analysis?.positionSummary}</div>
      {analysis?.hints?.length ? (
        <ul className={`mt-2 list-disc pl-4 ${tone === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
          {analysis.hints.slice(0, 2).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const CHESSBOARD_MAX_SIZE = 1200
const CHESS_INSTALL_HINT_DISMISSED_KEY = 'chess:ios-install-hint-dismissed:v1'
const IOS_INSTALL_DEMO_VIDEO_PATH = '/assets/pwa/install-ios.mp4'
const ANDROID_INSTALL_DEMO_VIDEO_PATH = '/assets/pwa/install-android.mp4'
const CHESS_SAFE_AREA_STYLE: React.CSSProperties = {
  boxSizing: 'border-box',
  paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
  paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
  paddingLeft: 'calc(env(safe-area-inset-left) + 8px)',
  paddingRight: 'calc(env(safe-area-inset-right) + 8px)',
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type CustomPieceProps = {
  squareWidth: number
  isDragging: boolean
}

type ChessPieceCode = 'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK' | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK'

const WOOD_TEXTURE_SVG_ASSETS: Record<ChessPieceCode, string> = {
  wP: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  wN: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  wB: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  wR: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  wQ: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  wK: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
  bP: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  bN: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  bB: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  bR: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  bQ: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  bK: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
}

function useWoodTexturePieceSet() {
  return useMemo(() => {
    const createPieceRenderer = (pieceCode: ChessPieceCode) => {
      const src = WOOD_TEXTURE_SVG_ASSETS[pieceCode]
      return function WoodTexturePiece({ squareWidth, isDragging }: CustomPieceProps): React.JSX.Element {
        return (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              width: squareWidth,
              height: squareWidth,
              opacity: isDragging ? 0.82 : 1,
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        )
      }
    }

    return {
      wP: createPieceRenderer('wP'),
      wN: createPieceRenderer('wN'),
      wB: createPieceRenderer('wB'),
      wR: createPieceRenderer('wR'),
      wQ: createPieceRenderer('wQ'),
      wK: createPieceRenderer('wK'),
      bP: createPieceRenderer('bP'),
      bN: createPieceRenderer('bN'),
      bB: createPieceRenderer('bB'),
      bR: createPieceRenderer('bR'),
      bQ: createPieceRenderer('bQ'),
      bK: createPieceRenderer('bK'),
    }
  }, [])
}

const CHESSBOARD_THEME = {
  customLightSquareStyle: { backgroundColor: '#f1dfc2' },
  customDarkSquareStyle: { backgroundColor: '#9b6a43' },
  customBoardStyle: {
    borderRadius: 10,
    boxShadow: 'inset 0 0 0 1px rgba(60,42,28,0.35), 0 10px 28px rgba(45,28,16,0.2)',
  },
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

      // Constrain by both dimensions whenever possible so the square board
      // never gets clipped on mobile browsers with dynamic address bars.
      const safeHeight = Math.max(0, height - 16)
      const limit = safeHeight > 0 ? Math.min(safeWidth, safeHeight) : safeWidth

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

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  const mediaStandalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = typeof window.navigator !== 'undefined' && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  return mediaStandalone || iosStandalone
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const isClassicIos = /iPhone|iPad|iPod/i.test(userAgent)
  const isIpadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isClassicIos || isIpadDesktopMode
}

function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  return /Android/i.test(userAgent)
}

function detectInstallHintPlatform(): 'ios' | 'android' | null {
  if (isIosDevice()) return 'ios'
  if (isAndroidDevice()) return 'android'
  return null
}

function useChessInstallHint() {
  const [showInstallHint, setShowInstallHint] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null)
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const detectedPlatform = detectInstallHintPlatform()
    if (!detectedPlatform) return
    if (isStandaloneDisplayMode()) return

    const dismissed = window.localStorage.getItem(CHESS_INSTALL_HINT_DISMISSED_KEY) === '1'
    setPlatform(detectedPlatform)
    if (!dismissed) {
      setShowInstallHint(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setDeferredInstallPrompt(null)
      setShowInstallHint(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const dismissInstallHint = useCallback(() => {
    setShowInstallHint(false)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHESS_INSTALL_HINT_DISMISSED_KEY, '1')
    }
  }, [])

  const triggerAndroidInstall = useCallback(async () => {
    if (!deferredInstallPrompt) return
    await deferredInstallPrompt.prompt()
    try {
      await deferredInstallPrompt.userChoice
    } finally {
      setDeferredInstallPrompt(null)
    }
  }, [deferredInstallPrompt])

  return {
    showInstallHint,
    dismissInstallHint,
    platform,
    canTriggerAndroidInstall: platform === 'android' && deferredInstallPrompt !== null,
    triggerAndroidInstall,
  }
}

function InstallDemoModal({
  platform,
  canTriggerAndroidInstall,
  onTriggerAndroidInstall,
  onClose,
}: {
  platform: 'ios' | 'android'
  canTriggerAndroidInstall: boolean
  onTriggerAndroidInstall: () => Promise<void>
  onClose: () => void
}) {
  const [videoFailed, setVideoFailed] = useState(false)
  const [androidInstallPending, setAndroidInstallPending] = useState(false)
  const videoPath = platform === 'ios' ? IOS_INSTALL_DEMO_VIDEO_PATH : ANDROID_INSTALL_DEMO_VIDEO_PATH

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onClick={onClose} role="dialog" aria-label="Install app demo">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            {platform === 'ios' ? 'Install on iPhone' : 'Install on Android'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
          >
            Close
          </button>
        </div>

        {!videoFailed ? (
          <video
            className="mb-3 w-full rounded-lg border border-slate-200"
            src={videoPath}
            autoPlay
            loop
            muted
            playsInline
            controls
            onError={() => setVideoFailed(true)}
          />
        ) : (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Demo video not found at <code>{videoPath}</code>. Add that file to <code>public/assets/pwa/</code>.
          </div>
        )}

        <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-600">
          {platform === 'ios' ? (
            <>
              <li>Tap Share in Safari.</li>
              <li>Tap Add to Home Screen.</li>
              <li>Open the app from the new Home Screen icon.</li>
            </>
          ) : (
            <>
              <li>Tap the browser menu (⋮).</li>
              <li>Tap Install app or Add to Home screen.</li>
              <li>Open the installed app from your launcher.</li>
            </>
          )}
        </ol>
        {platform === 'android' ? (
          <div className="mt-3">
            <button
              type="button"
              disabled={!canTriggerAndroidInstall || androidInstallPending}
              onClick={() => {
                setAndroidInstallPending(true)
                void onTriggerAndroidInstall().finally(() => setAndroidInstallPending(false))
              }}
              className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {androidInstallPending ? 'Opening install prompt…' : 'Install app now'}
            </button>
            {!canTriggerAndroidInstall ? (
              <p className="mt-1 text-[11px] text-slate-500">
                Install prompt not yet available. Try after a few seconds on Chrome/Edge Android.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ChessInstallHint({
  platform,
  canTriggerAndroidInstall,
  onTriggerAndroidInstall,
  onDismiss,
}: {
  platform: 'ios' | 'android'
  canTriggerAndroidInstall: boolean
  onTriggerAndroidInstall: () => Promise<void>
  onDismiss: () => void
}) {
  const [showDemo, setShowDemo] = useState(false)

  const title = platform === 'ios' ? 'For full-screen play on iPhone' : 'For app-like play on Android'
  const body = platform === 'ios'
    ? 'Open Share and tap Add to Home Screen, then launch from the Home Screen icon.'
    : 'Use browser menu to install/add to Home Screen, then launch from your installed app icon.'

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4" role="dialog" aria-modal="true" aria-label="Install app hint">
        <div className="w-full max-w-sm rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 shadow-2xl">
          <div className="font-semibold">{title}</div>
          <p className="mt-1">{body}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDemo(true)}
              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800"
            >
              Watch 10s demo
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
      {showDemo ? (
        <InstallDemoModal
          platform={platform}
          canTriggerAndroidInstall={canTriggerAndroidInstall}
          onTriggerAndroidInstall={onTriggerAndroidInstall}
          onClose={() => setShowDemo(false)}
        />
      ) : null}
    </>
  )
}

export default function ChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  const location = useLocation()
  const initialTutorTab = useMemo(() => parseInitialTutorTab(location.search), [location.search])
  const openStoryOnLoad = useMemo(() => shouldOpenStoryMode(location.search), [location.search])
  const openTutorFullscreen = useMemo(() => shouldOpenTutorFullscreen(location.search), [location.search])
  const initialStoryId = useMemo(() => parseInitialStoryId(location.search), [location.search])

  if (gameId === 'local') {
    return (
      <LocalChessGame
        initialTutorTab={initialTutorTab}
        openStoryOnLoad={openStoryOnLoad}
        openTutorFullscreen={openTutorFullscreen}
        initialStoryId={initialStoryId}
      />
    )
  }
  return (
    <OnlineChessGame
      initialTutorTab={initialTutorTab}
      openStoryOnLoad={openStoryOnLoad}
      openTutorFullscreen={openTutorFullscreen}
      initialStoryId={initialStoryId}
    />
  )
}

function OnlineChessGame({
  initialTutorTab,
  openStoryOnLoad,
  openTutorFullscreen,
  initialStoryId,
}: {
  initialTutorTab?: TutorTab
  openStoryOnLoad?: boolean
  openTutorFullscreen?: boolean
  initialStoryId?: string
}): React.JSX.Element {
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
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null)
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const {
    showInstallHint,
    dismissInstallHint,
    platform: installPlatform,
    canTriggerAndroidInstall,
    triggerAndroidInstall,
  } = useChessInstallHint()

  const moveRows = useMemo(() => (moves ?? []) as MoveRow[], [moves])
  const woodTexturePieces = useWoodTexturePieceSet()
  const hintedByPly = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const move of moveRows) {
      const ply = Number(move.ply)
      if (!Number.isFinite(ply)) continue
      map.set(ply, move.hint_used === true)
    }
    return map
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
    }
  }

  async function handleQuitGame() {
    if (!gameId) {
      navigate('/games/chess')
      return
    }

    try {
      await abortGame(gameId)
    } catch {
      // Keep navigation resilient even if quit persistence fails.
    } finally {
      navigate('/games/chess')
    }
  }

  function handleGoHome() {
    navigate('/')
  }

  const normalizedDisplayFen = optimisticFen || displayFen || START_FEN
  const currentTurn = (normalizedDisplayFen.split(' ')[1] as 'w' | 'b' | undefined) || (game?.current_turn as 'w' | 'b' | null) || null
  const currentUserId = user?.id ?? null
  const boardId = `${gameId ?? 'game'}-${currentUserId ?? 'anon'}-online`
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
  const tutorialFullscreenMode = Boolean(openTutorFullscreen)
  const canMove = !isAborted && !gameEnd.isOver && !isViewingPast && isMember && isUserTurn && !pendingPromotion
  const boardOrientation: 'white' | 'black' = isCurrentBlack ? 'black' : 'white'
  const boardKey = `${boardId}:${boardOrientation}:${normalizedDisplayFen}`

  const { isReady, topMoves, analyzePosition } = useStockfish()

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
    setTutorAnalysis(null)
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
    <div className="chess-local-theme relative flex h-[100dvh] overflow-hidden rounded-none bg-chess-bg p-2 shadow-chess-card sm:p-3" style={CHESS_SAFE_AREA_STYLE}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="mb-2 flex flex-none items-center justify-between gap-3">
          <h2 className="text-base font-semibold sm:text-lg">Chess</h2>
          <div className="flex items-center gap-2">
            {tutorialFullscreenMode ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { void handleQuitGame() }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Quit
                </button>
                <button
                  type="button"
                  onClick={handleGoHome}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Home
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-label={isMenuOpen ? 'Close game menu' : 'Open game menu'}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm"
            >
              ☰
            </button>
          </div>
        </div>
      {isMenuOpen ? (
        <div className="absolute right-2 top-14 z-40 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg sm:right-3 sm:top-16">
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              navigate(-1)
            }}
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              void handleQuitGame()
            }}
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Quit game
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              handleGoHome()
            }}
            className="w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Home page
          </button>
        </div>
      ) : null}
      {showInstallHint && installPlatform ? (
        <ChessInstallHint
          platform={installPlatform}
          canTriggerAndroidInstall={canTriggerAndroidInstall}
          onTriggerAndroidInstall={triggerAndroidInstall}
          onDismiss={dismissInstallHint}
        />
      ) : null}
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
      <div className={`flex min-h-0 flex-1 flex-col ${tutorialFullscreenMode ? 'gap-0' : 'gap-2 landscape:flex-row lg:flex-row'}`}>
        <div className={`${tutorialFullscreenMode ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-slate-200/80 bg-white/80 p-2 shadow-sm sm:p-3`}>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', topFallback)}
          </div>
          <div ref={boardContainerRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            <div className="mx-auto overflow-hidden rounded-xl ring-1 ring-slate-200 shadow-sm" style={{ width: boardSize }}>
              <Chessboard
                id={boardId}
                key={boardKey}
                position={normalizedDisplayFen}
                boardOrientation={boardOrientation}
                customPieces={woodTexturePieces}
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

        <aside className={`${tutorialFullscreenMode ? 'hidden' : 'flex'} min-h-0 w-full shrink-0 flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm max-h-[42dvh] landscape:h-full landscape:max-h-none landscape:w-[360px] landscape:max-w-[44vw] lg:w-[380px]`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Moves & controls</div>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
            >
              {isMenuOpen ? 'Docked' : 'Dock'}
            </button>
          </div>
          <div className="mb-3 text-xs text-slate-500">
            Status: {game?.status ?? 'loading'} · {currentMember?.role ? `You are ${currentMember.role}` : 'Spectating'}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleAnalyzeGameForMe() }}
              disabled={tutorLoading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              {tutorLoading ? 'Analyzing…' : 'Analyze game'}
            </button>
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
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(`chess:save:${gameId ?? 'online'}`, JSON.stringify({
                    savedAt: new Date().toISOString(),
                    gameId,
                    fen: normalizedDisplayFen,
                    moves: moveRows,
                  }))
                  setToastSeverity('success')
                  setToastMessage('Game saved locally')
                } catch {
                  setToastSeverity('error')
                  setToastMessage('Failed to save game locally')
                }
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Save game
            </button>
            <button
              onClick={() => { void handleQuitGame() }}
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Resign
            </button>
            <button
              type="button"
              onClick={() => navigate('/games/chess')}
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
            >
              Exit
            </button>
          </div>
          <InlineAnalysisResult loading={tutorLoading} error={tutorError} analysis={tutorAnalysis} modelLabel={tutorModel} />
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="mb-2 text-xs font-semibold text-slate-600">Hint + board overlays</div>
            <div className="flex flex-col gap-2">
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
            <div className="mt-2 text-xs text-slate-500">
              {isViewingPast ? `Viewing move ${viewPly}/${moveRows.length}` : 'Live'}
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
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
            {loading || movesLoading ? (
              <span className="text-xs text-slate-500">Loading…</span>
            ) : null}
          </div>
            <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>

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
        {tutorialFullscreenMode ? (
          <div className="min-h-0 flex-1 rounded-2xl border border-slate-700 bg-slate-800/70 p-3 sm:p-4">
            <ChessTutorStudio
              analysis={tutorAnalysis}
              modelLabel={tutorModel}
              loading={tutorLoading}
              error={tutorError}
              onAnalyze={() => { void handleAnalyzeGameForMe() }}
              initialTab={initialTutorTab}
              openStoryOnLoad={openStoryOnLoad}
              initialStoryId={initialStoryId}
              allowAnalyzeTab={!tutorialFullscreenMode}
              stories={CHESS_STORIES}
              lessons={CHESS_LESSONS}
              lessonSections={LESSON_SECTIONS}
              historyEvents={CHESS_HISTORY_EVENTS}
              notationMoves={NOTATION_LINE_MOVES}
              notationFrames={NOTATION_LINE_FRAMES}
              notationGuideRows={NOTATION_GUIDE_ROWS}
              rankReference={RANK_REFERENCE}
              fileReference={FILE_REFERENCE}
              rankDemoSquares={RANK_DEMO_SQUARES}
              fileDemoSquares={FILE_DEMO_SQUARES}
              attackPatterns={ATTACK_PATTERNS}
              discoveredCheckPattern={DISCOVERED_CHECK_PATTERN}
              lessonSquareStyles={lessonSquareStyles}
              customPieces={woodTexturePieces}
              storyModalComponent={({ open, onClose, pdfUrl, storyTitle, storyAudioSlug }) => (
                <ChessStoryModal
                  open={open}
                  onClose={onClose}
                  pdfUrl={pdfUrl}
                  storyTitle={storyTitle}
                  storyAudioSlug={storyAudioSlug as ChessStoryAudioSlug}
                />
              )}
              onPractice={() => navigate('/games/local?tab=analyze')}
            />
          </div>
        ) : null}
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
    </div>
  )
}

function LocalChessGame({
  initialTutorTab,
  openStoryOnLoad,
  openTutorFullscreen,
  initialStoryId,
}: {
  initialTutorTab?: TutorTab
  openStoryOnLoad?: boolean
  openTutorFullscreen?: boolean
  initialStoryId?: string
}): React.JSX.Element {
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const {
    showInstallHint,
    dismissInstallHint,
    platform: installPlatform,
    canTriggerAndroidInstall,
    triggerAndroidInstall,
  } = useChessInstallHint()

  const moveRows = useMemo(() => localMoves, [localMoves])
  const woodTexturePieces = useWoodTexturePieceSet()
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

  const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'
  const primaryActionClass = `rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-1.5 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClass}`
  const secondaryActionClass = `rounded-md border border-slate-600 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-50 ${focusRingClass}`
  const ghostActionClass = `rounded-md border border-slate-600 bg-slate-800/50 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700/80 ${focusRingClass}`

  const renderPlayerLabel = (label: GameMemberProfile | null, isTurn: boolean, fallback: string) => {
    const role = label?.role
    const displayName = label?.username || fallback
    const roleLabel = role === 'white' ? 'White' : role === 'black' ? 'Black' : role || 'Player'
    const roleBadgeClass = role === 'white'
      ? 'bg-slate-100 text-slate-800'
      : role === 'black'
        ? 'border border-slate-700 bg-slate-900 text-slate-100'
        : 'bg-slate-700 text-slate-100'

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isTurn ? 'bg-emerald-500' : 'bg-slate-600'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-slate-100">{displayName}</span>
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

  const { isReady, topMoves, analyzePosition, getEngineMove, cancelPendingMove, skillLevel, setSkillLevel } = useStockfish()

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
    setTutorAnalysis(null)
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
    navigate('/games/chess')
  }

  function handleGoHome() {
    truncateMoves(0)
    navigate('/')
  }

  const tutorialFullscreenMode = Boolean(openTutorFullscreen)

  return (
    <div className="relative flex h-[100dvh] overflow-hidden rounded-none bg-slate-900 p-2 text-slate-100 shadow-sm sm:p-3" style={CHESS_SAFE_AREA_STYLE}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className={`flex flex-none items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-800/80 ${tutorialFullscreenMode ? 'mb-1.5 p-2' : 'mb-2 p-3'}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/games/chess')}
              className={`rounded-md border border-slate-700 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 ${focusRingClass}`}
            >
              Back to Chess
            </button>
            <h2 className="text-base font-semibold text-slate-100 sm:text-lg">Chess (Local)</h2>
          </div>
          <div className="flex items-center gap-2">
            {tutorialFullscreenMode ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className={secondaryActionClass}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleQuitGame}
                  className={secondaryActionClass}
                >
                  Quit
                </button>
                <button
                  type="button"
                  onClick={handleGoHome}
                  className={secondaryActionClass}
                >
                  Home
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-label={isMenuOpen ? 'Close game menu' : 'Open game menu'}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900/40 text-slate-200 shadow-sm transition hover:bg-slate-800 ${focusRingClass}`}
            >
              ☰
            </button>
          </div>
        </div>
      {isMenuOpen ? (
        <div className="absolute right-2 top-14 z-40 w-44 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-lg sm:right-3 sm:top-16">
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              navigate(-1)
            }}
            className={`mb-1 w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-100 hover:bg-slate-800 ${focusRingClass}`}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              handleQuitGame()
            }}
            className={`mb-1 w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-100 hover:bg-slate-800 ${focusRingClass}`}
          >
            Quit game
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false)
              handleGoHome()
            }}
            className={`w-full rounded px-2 py-1.5 text-left text-sm font-medium text-slate-100 hover:bg-slate-800 ${focusRingClass}`}
          >
            Home page
          </button>
        </div>
      ) : null}
      {showInstallHint && installPlatform ? (
        <ChessInstallHint
          platform={installPlatform}
          canTriggerAndroidInstall={canTriggerAndroidInstall}
          onTriggerAndroidInstall={triggerAndroidInstall}
          onDismiss={dismissInstallHint}
        />
      ) : null}
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
      <div className={`flex min-h-0 flex-1 flex-col ${tutorialFullscreenMode ? 'gap-0' : 'gap-2 landscape:flex-row lg:flex-row'}`}>
        <div className={`${tutorialFullscreenMode ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-slate-700 bg-slate-800/70 p-3 shadow-sm sm:p-4`}>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', 'Stockfish')}
          </div>
          <div ref={boardContainerRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            <div className="mx-auto overflow-hidden rounded-xl ring-1 ring-slate-700 shadow-sm" style={{ width: boardSize }}>
              <Chessboard
                position={normalizedDisplayFen}
                boardOrientation="white"
                customPieces={woodTexturePieces}
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

        <aside className={`${tutorialFullscreenMode ? 'hidden' : 'flex'} min-h-0 w-full shrink-0 flex-col overflow-y-auto rounded-2xl border border-slate-700 bg-slate-800/70 p-4 text-slate-100 shadow-sm max-h-[42dvh] landscape:h-full landscape:max-h-none landscape:w-[360px] landscape:max-w-[44vw] lg:w-[380px]`}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Moves & controls</div>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={ghostActionClass}
            >
              {isMenuOpen ? 'Docked' : 'Dock'}
            </button>
          </div>
          <div className="mb-3 text-xs text-slate-300">Status: {engineThinking ? 'thinking' : 'ready'}</div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { void handleAnalyzeGameForMe() }}
              disabled={tutorLoading}
              className={primaryActionClass}
            >
              {tutorLoading ? 'Analyzing…' : 'Analyze game'}
            </button>
            <button
              onClick={handleUndoMove}
              disabled={viewPly === 0}
              className={secondaryActionClass}
            >
              Undo
            </button>
            <button
              onClick={() => setViewPly((prev) => Math.min(moveRows.length, prev + 1))}
              disabled={viewPly >= moveRows.length}
              className={secondaryActionClass}
            >
              Redo
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('chess:save:local', JSON.stringify({
                    savedAt: new Date().toISOString(),
                    fen: normalizedDisplayFen,
                    moves: moveRows,
                  }))
                  setToastSeverity('success')
                  setToastMessage('Game saved locally')
                } catch {
                  setToastSeverity('error')
                  setToastMessage('Failed to save game locally')
                }
              }}
              className={secondaryActionClass}
            >
              Save game
            </button>
            <button
              onClick={handleQuitGame}
              className={secondaryActionClass}
            >
              Resign
            </button>
            <button
              type="button"
              onClick={() => navigate('/games/chess')}
              className={secondaryActionClass}
            >
              Exit
            </button>
          </div>
          <InlineAnalysisResult loading={tutorLoading} error={tutorError} analysis={tutorAnalysis} modelLabel={tutorModel} tone="dark" />
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-100">Computer level</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-100">{skillLevel}</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={skillLevel}
              onChange={(event) => setSkillLevel(Number(event.target.value))}
              className="w-full accent-indigo-400"
              aria-label="Computer level"
            />
          </div>
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
            <div className="mb-2 text-xs font-semibold text-slate-100">Hint + board overlays</div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={showLegalMoves}
                  onChange={(event) => setShowLegalMoves(event.target.checked)}
                  className="h-4 w-4 accent-indigo-400"
                />
                Show legal moves
              </label>
              <label className="flex items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={showThreats}
                  onChange={(event) => setShowThreats(event.target.checked)}
                  className="h-4 w-4 accent-indigo-400"
                />
                Highlight threats
              </label>
              <label className="flex items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={showControlledArea}
                  onChange={(event) => setShowControlledArea(event.target.checked)}
                  className="h-4 w-4 accent-indigo-400"
                />
                Highlight controlled area
              </label>
            </div>
            <div className="mt-2 text-xs text-slate-300">
              {isViewingPast ? `Viewing move ${viewPly}/${moveRows.length}` : 'Live'}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-200">Top hints <span className="text-xs text-slate-400">(used: {hintCount})</span></div>
              {!showHintsVisible ? (
                <div className="flex">
                  <button
                    type="button"
                    className={secondaryActionClass}
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
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-100">Move History</div>
          </div>
          <div className="mb-3 text-xs text-slate-300">{memberCountLabel}</div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {moveHistoryRowsNewestFirst.length ? (
              <table className="w-full text-left text-sm text-slate-200">
                <thead className="sticky top-0 bg-slate-800/90">
                  <tr className="text-xs uppercase text-slate-300">
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
                      <tr key={row.moveNumber} className="border-t border-slate-700">
                        <td className="py-2 pr-2 text-xs text-slate-400">{row.moveNumber}.</td>
                        <td className={`py-2 font-medium ${whiteHint ? 'text-purple-300' : ''}`}>
                          {row.white ? (
                            <button
                              type="button"
                              className={`rounded px-1 py-0.5 text-left hover:bg-slate-700/70 ${focusRingClass}`}
                              onClick={() => setViewPly(whitePly)}
                            >
                              <span>{row.white}</span>
                              {whiteHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                        <td className={`py-2 font-medium ${blackHint ? 'text-purple-300' : ''}`}>
                          {row.black ? (
                            <button
                              type="button"
                              className={`rounded px-1 py-0.5 text-left hover:bg-slate-700/70 ${focusRingClass}`}
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
              <div className="text-sm text-slate-300">No moves yet.</div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-300">
            Game: local
          </div>

        </aside>
        {tutorialFullscreenMode ? (
          <div className="min-h-0 flex-1 rounded-2xl border border-slate-700 bg-slate-800/70 p-2 sm:p-3">
            <ChessTutorStudio
              analysis={tutorAnalysis}
              modelLabel={tutorModel}
              loading={tutorLoading}
              error={tutorError}
              onAnalyze={() => { void handleAnalyzeGameForMe() }}
              initialTab={initialTutorTab}
              openStoryOnLoad={openStoryOnLoad}
              initialStoryId={initialStoryId}
              allowAnalyzeTab={!tutorialFullscreenMode}
              stories={CHESS_STORIES}
              lessons={CHESS_LESSONS}
              lessonSections={LESSON_SECTIONS}
              historyEvents={CHESS_HISTORY_EVENTS}
              notationMoves={NOTATION_LINE_MOVES}
              notationFrames={NOTATION_LINE_FRAMES}
              notationGuideRows={NOTATION_GUIDE_ROWS}
              rankReference={RANK_REFERENCE}
              fileReference={FILE_REFERENCE}
              rankDemoSquares={RANK_DEMO_SQUARES}
              fileDemoSquares={FILE_DEMO_SQUARES}
              attackPatterns={ATTACK_PATTERNS}
              discoveredCheckPattern={DISCOVERED_CHECK_PATTERN}
              lessonSquareStyles={lessonSquareStyles}
              customPieces={woodTexturePieces}
              storyModalComponent={({ open, onClose, pdfUrl, storyTitle, storyAudioSlug }) => (
                <ChessStoryModal
                  open={open}
                  onClose={onClose}
                  pdfUrl={pdfUrl}
                  storyTitle={storyTitle}
                  storyAudioSlug={storyAudioSlug as ChessStoryAudioSlug}
                />
              )}
              onPractice={() => navigate('/games/local?tab=analyze')}
            />
          </div>
        ) : null}
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
    </div>
  )
}
