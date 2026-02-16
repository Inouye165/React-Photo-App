export type DirectorActionType = 'MOVE' | 'HIGHLIGHT' | 'BOARD_STATE'
export type StoryHighlightTone = 'yellow' | 'blue' | 'royal' | 'red'

type DirectorActionBase = {
  timestamp: number
  type: DirectorActionType
  label: string
}

export type StoryDirectorAction =
  | (DirectorActionBase & { type: 'MOVE'; move: string })
  | (DirectorActionBase & { type: 'HIGHLIGHT'; squares: string[]; tone?: StoryHighlightTone })
  | (DirectorActionBase & { type: 'BOARD_STATE'; fen: string })

export type StoryScriptByPage = Record<number, StoryDirectorAction[]>

export const architectOfSquaresScript: StoryScriptByPage = {
  1: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Initial Board Setup',
    }
  ],
  2: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Starting Position',
    }
  ],
  3: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Starting Army',
    },
    {
      timestamp: 11,
      type: 'HIGHLIGHT',
      squares: ['h1'],
      tone: 'yellow',
      label: 'White on Right',
    },
    {
      timestamp: 18,
      type: 'HIGHLIGHT',
      squares: ['a1', 'h1', 'a8', 'h8'],
      tone: 'blue',
      label: 'Rooks in corners',
    },
    {
      timestamp: 19,
      type: 'HIGHLIGHT',
      squares: ['b1', 'g1', 'b8', 'g8'],
      tone: 'yellow',
      label: 'Knights beside Rooks',
    },
    {
      timestamp: 22,
      type: 'HIGHLIGHT',
      squares: ['c1', 'f1', 'c8', 'f8'],
      tone: 'blue',
      label: 'Bishops next to royals',
    },
    {
      timestamp: 26,
      type: 'HIGHLIGHT',
      squares: ['d1', 'd8'],
      tone: 'royal',
      label: 'Queens on own color',
    },
    {
      timestamp: 28,
      type: 'HIGHLIGHT',
      squares: ['e1', 'e8'],
      tone: 'yellow',
      label: 'The Kings',
    }
  ],
  4: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Pawns Setup',
    },
    {
      timestamp: 4,
      type: 'HIGHLIGHT',
      squares: ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'],
      tone: 'yellow',
      label: 'Highlight all pawns',
    },
    {
      timestamp: 14,
      type: 'MOVE',
      move: 'e2e4',
      label: 'Pawn leap two squares',
    },
    {
      timestamp: 23,
      type: 'HIGHLIGHT',
      squares: ['d5', 'f5'],
      tone: 'red',
      label: 'Pawn capture diagonals',
    }
  ],
  5: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Rooks in corners',
    },
    {
      timestamp: 1,
      type: 'HIGHLIGHT',
      squares: ['a1', 'h1', 'a8', 'h8'],
      tone: 'blue',
      label: 'Tower Rooks',
    },
    {
      timestamp: 6,
      type: 'BOARD_STATE',
      fen: '4k3/8/8/8/3R4/8/8/4K3 w - - 0 1',
      label: 'Solo Rook center',
    },
    {
      timestamp: 8,
      type: 'HIGHLIGHT',
      squares: ['d1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8', 'a4', 'b4', 'c4', 'e4', 'f4', 'g4', 'h4'],
      tone: 'blue',
      label: 'Rook straight lines',
    },
    {
      timestamp: 16,
      type: 'BOARD_STATE',
      fen: '4k3/8/8/3b4/8/8/8/4K3 w - - 0 1',
      label: 'Solo Bishop center',
    },
    {
      timestamp: 18,
      type: 'HIGHLIGHT',
      squares: ['a2', 'b3', 'c4', 'e6', 'f7', 'g8', 'h1', 'g2', 'f3', 'e4', 'c6', 'b7', 'a8'],
      tone: 'yellow',
      label: 'Bishop diagonals',
    }
  ],
  6: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      label: 'Reset for Knights',
    },
    {
      timestamp: 4,
      type: 'HIGHLIGHT',
      squares: ['g1', 'b1', 'g8', 'b8'],
      tone: 'yellow',
      label: 'Mystery Knights',
    },
    {
      timestamp: 6,
      type: 'MOVE',
      move: 'g1f3',
      label: 'White Knight Jump',
    },
    {
      timestamp: 8,
      type: 'MOVE',
      move: 'g8f6',
      label: 'Black Knight Jump',
    }
  ],
  7: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
      label: 'Clear for Queen',
    },
    {
      timestamp: 3,
      type: 'BOARD_STATE',
      fen: '4k3/8/8/8/4Q3/8/8/4K3 w - - 0 1',
      label: 'Queen at e4',
    },
    {
      timestamp: 5,
      type: 'HIGHLIGHT',
      squares: ['e1', 'e2', 'e3', 'e5', 'e6', 'e7', 'e8', 'a4', 'b4', 'c4', 'd4', 'f4', 'g4', 'h4', 'b1', 'c2', 'd3', 'f5', 'g6', 'h7', 'a8', 'b7', 'c6', 'd5', 'f3', 'g2', 'h1'],
      tone: 'royal',
      label: 'Queen reach',
    },
    {
      timestamp: 18,
      type: 'BOARD_STATE',
      fen: '4k3/8/8/8/4K3/8/8/8 w - - 0 1',
      label: 'King at e4',
    },
    {
      timestamp: 20,
      type: 'HIGHLIGHT',
      squares: ['d3', 'e3', 'f3', 'd4', 'f4', 'd5', 'e5', 'f5'],
      tone: 'yellow',
      label: 'King reach',
    }
  ],
  8: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
      label: 'Castling Setup',
    },
    {
      timestamp: 10,
      type: 'MOVE',
      move: 'e1g1',
      label: 'White King-side Castle',
    },
    {
      timestamp: 15,
      type: 'MOVE',
      move: 'e8c8',
      label: 'Black Queen-side Castle',
    }
  ],
  9: [
    {
      timestamp: 0,
      type: 'BOARD_STATE',
      fen: '3k3r/8/8/6N1/8/8/8/5K2 w - - 0 1',
      label: 'Fork setup',
    },
    {
      timestamp: 19,
      type: 'MOVE',
      move: 'g5f7',
      label: 'Knight Fork',
    },
    {
      timestamp: 21,
      type: 'MOVE',
      move: 'd8e8',
      label: 'King escapes',
    },
    {
      timestamp: 23,
      type: 'MOVE',
      move: 'f7h8',
      label: 'Knight takes Rook',
    }
  ]
};

export function createDirectorScriptForPage(pageNumber: number): StoryDirectorAction[] {
  const pageActions = architectOfSquaresScript[pageNumber] ?? []

  return pageActions
    .map((action) => {
      if (action.type === 'HIGHLIGHT') {
        return {
          ...action,
          squares: [...action.squares],
        }
      }

      return { ...action }
    })
    .sort((firstAction, secondAction) => firstAction.timestamp - secondAction.timestamp)
}