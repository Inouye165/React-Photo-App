import { Chess } from 'chess.js'
import type { GotwAnalysisPack } from './chessGotw.types'

export type { PlyClassification, PlySymbol, PlyAnalysis, GotwChapter, GotwAnalysisPack } from './chessGotw.types'
export { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from './chessGotw.types'

export type ReplayPly = {
  san: string
  comment?: string
  ply: number
}

export type GotwPlayerMeta = {
  name: string
  rating?: string | null
  bio?: string
}

export type GotwEntry = {
  slug: string
  title: string
  subtitle: string
  description: string
  narrative: string[]
  event: string
  year: string
  result: string
  playersLabel: string
  white: GotwPlayerMeta
  black: GotwPlayerMeta
  previewRange: {
    startPly: number
    endPly: number
  }
  moves: ReplayPly[]
  analysis?: GotwAnalysisPack
}

const BYRNE_FISCHER_MOVES: ReplayPly[] = [
  { ply: 1, san: 'Nf3' },
  { ply: 2, san: 'Nf6' },
  { ply: 3, san: 'c4' },
  { ply: 4, san: 'g6' },
  { ply: 5, san: 'Nc3' },
  { ply: 6, san: 'Bg7' },
  { ply: 7, san: 'd4' },
  { ply: 8, san: 'O-O' },
  { ply: 9, san: 'Bf4' },
  { ply: 10, san: 'd5' },
  { ply: 11, san: 'Qb3' },
  { ply: 12, san: 'dxc4' },
  { ply: 13, san: 'Qxc4' },
  { ply: 14, san: 'c6' },
  { ply: 15, san: 'e4' },
  { ply: 16, san: 'Nbd7' },
  { ply: 17, san: 'Rd1' },
  { ply: 18, san: 'Nb6' },
  { ply: 19, san: 'Qc5' },
  { ply: 20, san: 'Bg4' },
  {
    ply: 21,
    san: 'Bg5',
    comment: 'A slight inaccuracy. Byrne moves the same piece twice while his king is still in the center. Fischer immediately looks to punish this lack of development.',
  },
  {
    ply: 22,
    san: 'Na4',
    comment: 'Brilliant thunderbolt. Fischer offers a knight. If 23 Nxa4 then ...Nxe4 attacks queen + bishop and Black regains with advantage.',
  },
  { ply: 23, san: 'Qa3' },
  { ply: 24, san: 'Nxc3' },
  { ply: 25, san: 'bxc3' },
  {
    ply: 26,
    san: 'Nxe4',
    comment: 'Fischer ignores the hanging knight and focuses on the center.',
  },
  { ply: 27, san: 'Bxe7' },
  { ply: 28, san: 'Qb6' },
  { ply: 29, san: 'Bc4' },
  {
    ply: 30,
    san: 'Nxc3',
    comment: 'Another sacrifice. Fischer is systematically dismantling the white center.',
  },
  { ply: 31, san: 'Bc5' },
  { ply: 32, san: 'Rfe8+' },
  {
    ply: 33,
    san: 'Kf1',
    comment: 'Blunder. Byrne should have played Be2 to block. King move loses castling and traps rook.',
  },
  {
    ply: 34,
    san: 'Be6',
    comment: 'The queen-sacrifice masterstroke. Fischer offers his Queen; if taken, Black wins by force.',
  },
  {
    ply: 35,
    san: 'Bxb6',
    comment: 'Byrne accepts the challenge, likely not seeing the windmill.',
  },
  { ply: 36, san: 'Bxc4+' },
  { ply: 37, san: 'Kg1' },
  { ply: 38, san: 'Ne2+' },
  { ply: 39, san: 'Kf1' },
  { ply: 40, san: 'Nxd4+' },
  { ply: 41, san: 'Kg1' },
  { ply: 42, san: 'Ne2+' },
  { ply: 43, san: 'Kf1' },
  { ply: 44, san: 'Nc3+' },
  { ply: 45, san: 'Kg1' },
  {
    ply: 46,
    san: 'axb6',
    comment: 'Windmill ends. Fischer has won material and is about to convert decisively.',
  },
  { ply: 47, san: 'Qb4' },
  { ply: 48, san: 'Ra4' },
  { ply: 49, san: 'Qxb6' },
  {
    ply: 50,
    san: 'Nxd1',
    comment: 'Material note: Black has two rooks, two bishops, and a knight for the queen — massive practical advantage.',
  },
  { ply: 51, san: 'h3' },
  { ply: 52, san: 'Rxa2' },
  { ply: 53, san: 'Kh2' },
  { ply: 54, san: 'Nxf2' },
  { ply: 55, san: 'Re1' },
  { ply: 56, san: 'Rxe1' },
  { ply: 57, san: 'Qd8+' },
  { ply: 58, san: 'Bf8' },
  { ply: 59, san: 'Nxe1' },
  { ply: 60, san: 'Bd5' },
  { ply: 61, san: 'Nf3' },
  { ply: 62, san: 'Ne4' },
  { ply: 63, san: 'Qb8' },
  { ply: 64, san: 'b5' },
  { ply: 65, san: 'h4' },
  { ply: 66, san: 'h5' },
  { ply: 67, san: 'Ne5' },
  { ply: 68, san: 'Kg7' },
  { ply: 69, san: 'Kg1' },
  { ply: 70, san: 'Bc5+' },
  { ply: 71, san: 'Kf1' },
  { ply: 72, san: 'Ng3+' },
  { ply: 73, san: 'Ke1' },
  { ply: 74, san: 'Bb4+' },
  { ply: 75, san: 'Kd1' },
  { ply: 76, san: 'Bb3+' },
  { ply: 77, san: 'Kc1' },
  { ply: 78, san: 'Ne2+' },
  { ply: 79, san: 'Kb1' },
  { ply: 80, san: 'Nc3+' },
  { ply: 81, san: 'Kc1' },
  { ply: 82, san: 'Rc2#' },
]

export const DEFAULT_GOTW_SLUG = 'byrne-vs-fischer-1956'

const BYRNE_FISCHER_ANALYSIS: GotwAnalysisPack = {
  byPly: {
    11: {
      ply: 11,
      classification: 'inaccuracy',
      symbol: '?!',
      short: 'Early queen sortie',
      detail: 'Qb3 develops the queen early, inviting Black to gain tempo with ...dxc4.',
    },
    20: {
      ply: 20,
      classification: 'good',
      symbol: '!',
      short: 'Pins the knight',
      detail: 'Bg4 pins the Nf3 to the queen and increases pressure on the center.',
    },
    21: {
      ply: 21,
      classification: 'inaccuracy',
      symbol: '?!',
      short: 'Wastes tempo',
      detail: 'Bg5 moves the bishop again while the king remains in the center. Fischer immediately exploits the loss of coordination.',
    },
    22: {
      ply: 22,
      classification: 'brilliant',
      symbol: '!!',
      short: 'Knight thunderbolt',
      detail: 'Na4! offers the knight. If 23.Nxa4, ...Nxe4 attacks the queen and bishop, winning material with advantage.',
    },
    26: {
      ply: 26,
      classification: 'great',
      symbol: '!',
      short: 'Central strike',
      detail: 'Fischer ignores the hanging knight and captures in the center, prioritizing initiative.',
    },
    30: {
      ply: 30,
      classification: 'great',
      symbol: '!',
      short: 'Dismantles the center',
      detail: 'Another sacrifice. Fischer systematically destroys the white pawn structure.',
    },
    32: {
      ply: 32,
      classification: 'best',
      symbol: '!',
      short: 'Check forces king move',
      detail: 'Rfe8+ forces the white king to vacate the back rank, setting up the combination.',
    },
    33: {
      ply: 33,
      classification: 'blunder',
      symbol: '??',
      short: 'Loses by force',
      detail: 'Kf1 walks into a devastating combination. Be2 was required to block the check and maintain coordination.',
      bestMoveSan: 'Be2',
    },
    34: {
      ply: 34,
      classification: 'brilliant',
      symbol: '!!',
      short: 'Queen sacrifice',
      detail: 'Be6!! offers the queen. If Bxb6, the windmill begins: Bxc4+ starts an unstoppable sequence of discovery checks winning massive material.',
    },
    35: {
      ply: 35,
      classification: 'mistake',
      symbol: '?',
      short: 'Accepts the poison',
      detail: 'Bxb6 walks into the windmill. Declining was also difficult, but this loses by force.',
    },
    46: {
      ply: 46,
      classification: 'best',
      symbol: '!',
      short: 'Windmill complete',
      detail: 'axb6 ends the discovery sequence. Fischer emerges with two rooks, two bishops, and a knight versus the queen — a crushing material edge.',
    },
    50: {
      ply: 50,
      classification: 'great',
      symbol: '!',
      short: 'Wins the rook',
      detail: 'Nxd1 picks up the rook. Black now has overwhelming material to convert.',
    },
    70: {
      ply: 70,
      classification: 'best',
      symbol: '!',
      short: 'Mating net tightens',
      detail: 'Bc5+ continues forcing the king into a mating net. White has no defense.',
    },
    82: {
      ply: 82,
      classification: 'brilliant',
      symbol: '!!',
      short: 'Checkmate',
      detail: 'Rc2# — the final move. A fitting conclusion to one of the greatest games ever played.',
    },
  },
  chapters: [
    {
      ply: 21,
      title: 'The Inaccuracy',
      prompt: 'White just played Bg5 — moving the same piece twice. How should Black respond?',
      choices: [
        { san: 'Na4', correct: true },
        { san: 'h6' },
        { san: 'Be6' },
      ],
      revealText: 'Na4! exploits White\'s loss of tempo. If Nxa4, then Nxe4 wins material with a double attack.',
    },
    {
      ply: 33,
      title: 'The Blunder',
      prompt: 'White is in check after Rfe8+. Which king move should White choose?',
      choices: [
        { san: 'Be2', correct: true },
        { san: 'Kf1' },
        { san: 'Kd2' },
      ],
      revealText: 'Be2 blocks the check and keeps the position difficult but playable. Kf1 loses to the legendary queen sacrifice.',
    },
    {
      ply: 34,
      title: 'The Queen Sacrifice',
      prompt: 'Fischer plays Be6 — offering his queen. Why is this so strong?',
      revealText: 'If White captures the queen with Bxb6, Fischer unleashes a windmill: Bxc4+ followed by discovery checks that win back massive material.',
    },
    {
      ply: 36,
      title: 'The Windmill Begins',
      prompt: 'Bxc4+ starts a series of discovered checks. Watch the pieces fall.',
      revealText: 'The knight bounces between squares delivering discovered checks from the bishop, picking up white pieces on every bounce.',
    },
    {
      ply: 46,
      title: 'Material Count',
      prompt: 'The windmill is over. Count the material — who stands better?',
      revealText: 'Black has two rooks, two bishops, and a knight against White\'s queen. The material advantage is decisive.',
    },
    {
      ply: 82,
      title: 'Checkmate',
      prompt: 'Rc2# — the Game of the Century concludes.',
      revealText: 'A 13-year-old Bobby Fischer delivered one of the most celebrated victories in chess history.',
    },
  ],
}

export const GOTW_ENTRIES: Record<string, GotwEntry> = {
  [DEFAULT_GOTW_SLUG]: {
    slug: DEFAULT_GOTW_SLUG,
    title: 'Greatest Games of All Time',
    subtitle: 'The Game of the Century — Byrne vs Fischer (1956)',
    description: 'The Game of the Century is widely studied because it shows a young Bobby Fischer (playing Black) intuitively grasping complex positional sacrifices that even the world’s top players at the time struggled to calculate.',
    narrative: [
      'This classic begins as a practical fight for central control, but the position shifts the moment Fischer strikes with ...Na4 and a sequence of dynamic sacrifices. Rather than defending material, he prioritizes initiative, development, and king safety.',
      'The turning point arrives with 17...Be6, where Fischer offers his queen to unleash a coordinated attack. Byrne accepts, but Black’s minor pieces and rooks take over with forcing checks, tactical forks, and relentless tempo gains.',
      'What makes this game timeless is not only tactical brilliance, but strategic clarity: every sacrifice serves activity and coordination. It remains one of the best demonstrations of converting initiative into a decisive attack.',
    ],
    event: 'Rosenwald Memorial',
    year: '1956',
    result: '0–1',
    playersLabel: 'Byrne vs Fischer',
    white: {
      name: 'Donald Byrne',
      rating: null,
      bio: 'American International Master and respected teacher known for clear positional play. Byrne was a major U.S. chess figure in the 1950s and helped mentor a generation of competitive players.',
    },
    black: {
      name: 'Robert James Fischer',
      rating: null,
      bio: 'American chess prodigy who became one of the strongest players in history. At just 13, Fischer produced this game, a landmark of tactical imagination and attacking precision.',
    },
    previewRange: {
      startPly: 21,
      endPly: 30,
    },
    moves: BYRNE_FISCHER_MOVES,
    analysis: BYRNE_FISCHER_ANALYSIS,
  },
}

export function getGotwEntry(slug: string): GotwEntry | null {
  return GOTW_ENTRIES[slug] ?? null
}

export function getFenAtPly(moves: ReplayPly[], plyCount: number): string {
  const game = new Chess()

  for (let index = 0; index < plyCount; index += 1) {
    const moveResult = game.move(moves[index].san)
    if (!moveResult) break
  }

  return game.fen()
}

/** Replay moves up to `plyCount` and return the destination square of the last move. */
export function getDestSquareAtPly(moves: ReplayPly[], plyCount: number): string | null {
  if (plyCount <= 0) return null
  const game = new Chess()
  let lastTo: string | null = null

  for (let index = 0; index < plyCount; index += 1) {
    const result = game.move(moves[index].san)
    if (!result) break
    lastTo = result.to
  }

  return lastTo
}
