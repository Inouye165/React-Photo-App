import { Chess } from 'chess.js'

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
