import { supabase } from '../supabaseClient'
import { searchUsers } from './chat'
import { notifyGamesChanged } from '../events/gamesEvents'

async function requireAuthedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (/invalid jwt|token/i.test(error.message || '')) {
      await supabase.auth.signOut()
    }
    throw new Error(error.message || 'Not authenticated')
  }
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

export type GameMemberProfile = {
  user_id: string
  role: 'white' | 'black' | string
  username: string | null
}

export type GameWithMembers = GameRow & {
  members: GameMemberProfile[]
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

export async function listMyGamesWithMembers(): Promise<GameWithMembers[]> {
  const userId = await requireAuthedUserId()
  const { data: rows, error } = await supabase
    .from('game_members')
    .select('game_id, game:games(id, type, status, created_by, created_at, updated_at, time_control, current_fen, current_turn, result)')
    .eq('user_id', userId)

  if (error) throw error

  const items = (rows ?? []) as Array<{ game_id?: string; game?: GameRow | GameRow[] | null }>
  const games = items.flatMap((item) => {
    const game = item.game
    if (Array.isArray(game)) {
      return game.filter((row): row is GameRow => Boolean(row && typeof row.id === 'string'))
    }
    if (game && typeof game.id === 'string') return [game]
    return []
  })
  const gameIds = [...new Set(games.map((g) => g.id).filter((id) => typeof id === 'string'))]

  if (!gameIds.length) return games.map((g) => ({ ...g, members: [] }))

  const membersQuery = supabase
    .from('game_members')
    .select('game_id, role, user_id')

  const { data: memberRows, error: memberError } = gameIds.length === 1
    ? await membersQuery.eq('game_id', gameIds[0])
    : await membersQuery.in('game_id', gameIds)

  if (memberError) throw memberError

  const memberList = (memberRows ?? []) as Array<{ game_id?: unknown; role?: unknown; user_id?: unknown }>
  const userIds = memberList.map((row) => row.user_id).filter((id): id is string => typeof id === 'string')
  const uniqueUserIds = [...new Set(userIds)]

  const userMap = new Map<string, string | null>()
  if (uniqueUserIds.length) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username')
      .in('id', uniqueUserIds)

    if (usersError) throw usersError

    for (const row of (users ?? []) as Array<{ id?: unknown; username?: unknown }>) {
      if (typeof row.id !== 'string') continue
      userMap.set(row.id, typeof row.username === 'string' ? row.username : null)
    }
  }

  const membersByGame = new Map<string, GameMemberProfile[]>()
  for (const row of memberList) {
    if (typeof row.game_id !== 'string' || typeof row.user_id !== 'string') continue
    const member: GameMemberProfile = {
      user_id: row.user_id,
      role: typeof row.role === 'string' ? row.role : 'player',
      username: userMap.get(row.user_id) ?? null,
    }
    const list = membersByGame.get(row.game_id) ?? []
    list.push(member)
    membersByGame.set(row.game_id, list)
  }

  return games.map((game) => ({
    ...game,
    members: membersByGame.get(game.id) ?? [],
  }))
}

export async function createChessGame(opponentUserId: string | null, timeControl: TimeControl | null) {
  const userId = await requireAuthedUserId()

  // Attempt transactional creation via RPC to avoid orphan rows
  const rpcPayload: Record<string, unknown> = {
    p_created_by: userId,
    p_opponent_id: opponentUserId ?? null,
  }
  if (timeControl) rpcPayload.p_time_control = timeControl

  const { data: rpcGame, error: rpcError } = await supabase.rpc('create_chess_game', rpcPayload)

  if (!rpcError && rpcGame) {
    notifyGamesChanged()
    return rpcGame as GameRow
  }

  // Fallback to non-transactional REST if RPC is unavailable (404 / function not found)
  const rpcMessage = (rpcError?.message || '').toString()
  const isRpcMissing = /not found|404|function .* does not exist|could not find/i.test(rpcMessage)
  if (!isRpcMissing) throw rpcError

  const payload: Record<string, unknown> = { created_by: userId }
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
  if (membersError) {
    // Clean up orphan game row on member insert failure
    await supabase.from('games').delete().eq('id', game.id).then(() => {})
    throw membersError
  }

  notifyGamesChanged()

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

export async function fetchGameMembers(gameId: string): Promise<GameMemberProfile[]> {
  await requireAuthedUserId()
  const { data: members, error: membersError } = await supabase
    .from('game_members')
    .select('user_id, role')
    .eq('game_id', gameId)

  if (membersError) throw membersError

  const memberRows = (members ?? []) as Array<{ user_id?: unknown; role?: unknown }>
  const ids = memberRows.map((row) => row.user_id).filter((id): id is string => typeof id === 'string')
  const uniqueIds = [...new Set(ids)]

  if (!uniqueIds.length) {
    return memberRows
      .filter((row): row is { user_id: string; role: string } => typeof row.user_id === 'string' && typeof row.role === 'string')
      .map((row) => ({ user_id: row.user_id, role: row.role, username: null }))
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username')
    .in('id', uniqueIds)

  if (usersError) throw usersError

  const userMap = new Map<string, string | null>()
  for (const row of (users ?? []) as Array<{ id?: unknown; username?: unknown }>) {
    if (typeof row.id !== 'string') continue
    userMap.set(row.id, typeof row.username === 'string' ? row.username : null)
  }

  return memberRows
    .filter((row): row is { user_id: string; role: string } => typeof row.user_id === 'string' && typeof row.role === 'string')
    .map((row) => ({
      user_id: row.user_id,
      role: row.role,
      username: userMap.get(row.user_id) ?? null,
    }))
}

export async function makeMove(gameId: string, ply: number, uci: string, fenAfter: string) {
  const userId = await requireAuthedUserId()
  const { data, error } = await supabase.from('chess_moves').insert({ game_id: gameId, ply, uci, fen_after: fenAfter, created_by: userId }).select('*').single()
  if (error) throw error
  return data
}

export async function restartGame(gameId: string) {
  await requireAuthedUserId()
  // Try server-side RPC first
  const { error } = await supabase.rpc('restart_game', { p_game_id: gameId })
  if (!error) {
    notifyGamesChanged()
    return
  }

  // If RPC is not available (404) or fails, attempt a REST fallback.
  const message = (error && (error.message || '')).toString()
  const isNotFound = /not found|404|function .* does not exist|could not find/i.test(message)
  if (!isNotFound) throw error

  // Fallback: delete moves and reset game row via REST. This may be blocked by RLS if RPC is preferred.
  const { error: delErr } = await supabase.from('chess_moves').delete().eq('game_id', gameId)
  if (delErr) throw delErr

  const payload = {
    status: 'waiting',
    current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    current_turn: 'w',
    result: null,
    updated_at: new Date().toISOString(),
  }

  const { data, error: updErr } = await supabase.from('games').update(payload).eq('id', gameId).select('*').single()
  if (updErr) throw updErr
  notifyGamesChanged()
  return data as GameRow
}

export async function abortGame(gameId: string): Promise<void> {
  await requireAuthedUserId()
  const { error } = await supabase
    .from('games')
    .update({ status: 'aborted', updated_at: new Date().toISOString() })
    .eq('id', gameId)
  if (error) throw error
  notifyGamesChanged()
}

export { searchUsers }
