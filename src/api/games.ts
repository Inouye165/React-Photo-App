import { supabase } from '../supabaseClient'
import { searchUsers } from './chat'

async function requireAuthedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message || 'Not authenticated')
  const id = data?.user?.id
  if (!id) throw new Error('Not authenticated')
  return id
}

export type TimeControl = { mode: 'none' } | { mode: 'timed'; initialSeconds: number; incrementSeconds: number }

export type GameRow = {
  id: string
  type: string
  status: string
  created_by: string
  created_at: string
  updated_at: string
  time_control: TimeControl | null
  current_fen: string
  current_turn: string | null
  result: Record<string, unknown> | null
}

export async function listMyGames(): Promise<GameRow[]> {
  const userId = await requireAuthedUserId()

  const { data, error } = await supabase
    .from('game_members')
    .select('game:games(id, type, status, created_by, created_at, updated_at, time_control, current_fen, current_turn, result)')
    .eq('user_id', userId)

  if (error) throw error

  const rows = (data ?? []) as any[]
  return rows.map((r) => r.game as GameRow)
}

export async function createChessGame(opponentUserId: string | null, timeControl: TimeControl | null) {
  const userId = await requireAuthedUserId()
  const payload: any = { created_by: userId }
  if (timeControl) payload.time_control = timeControl

  const { data: game, error: gameError } = await supabase
    .from('games')
    .insert(payload)
    .select('*')
    .single()

  if (gameError) throw gameError

  // add creator as white by default
  const members = [{ game_id: game.id, user_id: userId, role: 'white' }]
  if (opponentUserId) members.push({ game_id: game.id, user_id: opponentUserId, role: 'black' })

  const { error: membersError } = await supabase.from('game_members').insert(members)
  if (membersError) throw membersError

  return game as GameRow
}

export async function fetchGame(gameId: string) {
  await requireAuthedUserId()
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single()
  if (error) throw error
  return data as GameRow
}

export async function fetchMoves(gameId: string) {
  await requireAuthedUserId()
  const { data, error } = await supabase
    .from('chess_moves')
    .select('*')
    .eq('game_id', gameId)
    .order('ply', { ascending: true })
  if (error) throw error
  return data as Array<{ id: string; ply: number; uci: string; fen_after: string; created_by: string; created_at: string }>
}

export async function makeMove(gameId: string, ply: number, uci: string, fenAfter: string) {
  const userId = await requireAuthedUserId()
  const { data, error } = await supabase.from('chess_moves').insert({ game_id: gameId, ply, uci, fen_after: fenAfter, created_by: userId }).select('*').single()
  if (error) throw error
  return data
}

export { searchUsers }
