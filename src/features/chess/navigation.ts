import type { NavigateFunction } from 'react-router-dom'
import { createChessGame } from '../../api/games'

export type ChessTutorTab = 'analyze' | 'lesson' | 'history'

export async function createGameAndOpenTutorTab(
  navigate: NavigateFunction,
  tab: ChessTutorTab,
): Promise<string> {
  const game = await createChessGame(null, null)
  navigate(`/games/${game.id}?tab=${tab}`)
  return game.id
}