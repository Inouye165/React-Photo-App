export type Opening = {
  name: string
  uci: string[]
}

const openings: Opening[] = [
  { name: 'Ruy Lopez', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] },
  { name: 'Italian Game', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] },
  { name: 'Sicilian Defense', uci: ['e2e4', 'c7c5'] },
  { name: 'French Defense', uci: ['e2e4', 'e7e6'] },
  { name: 'Caro-Kann Defense', uci: ['e2e4', 'c7c6'] },
  { name: 'Queen\'s Gambit', uci: ['d2d4', 'd7d5', 'c2c4'] },
  { name: 'King\'s Indian Defense', uci: ['d2d4', 'g8f6', 'c2c4', 'g7g6'] },
  { name: 'English Opening', uci: ['c2c4'] },
  { name: 'London System', uci: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4'] },
]

export function findOpening(moves: string[]): Opening | null {
  if (!moves.length) return null

  let best: Opening | null = null
  for (const opening of openings) {
    if (opening.uci.length > moves.length) continue
    let matches = true
    for (let i = 0; i < opening.uci.length; i += 1) {
      if (opening.uci[i] !== moves[i]) {
        matches = false
        break
      }
    }
    if (matches) {
      if (!best || opening.uci.length > best.uci.length) {
        best = opening
      }
    }
  }

  return best
}

export { openings }
