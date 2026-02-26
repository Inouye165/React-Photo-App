import { supabase } from '../supabaseClient'
import { searchUsers } from './chat'
import { notifyGamesChanged } from '../events/gamesEvents'
import { logActivity } from './activity'

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
  avatar_url?: string | null
}

export type GameWithMembers = GameRow & {
  members: GameMemberProfile[]
}

const missingRpcCache = new Set<string>()

type RpcErrorLike = {
  message?: string
  details?: string
  hint?: string
  code?: string
  status?: number
}

function isRpcNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rpcError = error as RpcErrorLike
  if (rpcError.status === 404) return true

  const code = (rpcError.code || '').toUpperCase()
  if (code === 'PGRST202' || code === '42883') return true

  const text = [rpcError.message, rpcError.details, rpcError.hint]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()

  return /not found|404|function .* does not exist|could not find|schema cache/i.test(text)
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false
  const rpcError = error as RpcErrorLike
  const code = (rpcError.code || '').toUpperCase()

  const text = [rpcError.message, rpcError.details, rpcError.hint]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()

  const col = columnName.toLowerCase()
  const referencesColumn = text.includes(col)

  if (code === '42703') return referencesColumn
  return referencesColumn && /column|schema cache|could not find/i.test(text)
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
  const membersByGame = new Map<string, GameMemberProfile[]>()

  const userMap = new Map<string, string | null>()
  if (uniqueUserIds.length) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .in('id', uniqueUserIds)

    if (usersError) throw usersError

    const usersRows = (users ?? []) as Array<{ id?: unknown; username?: unknown; avatar_url?: unknown }>
    for (const row of usersRows) {
      if (typeof row.id !== 'string') continue
      userMap.set(row.id, typeof row.username === 'string' ? row.username : null)
    }

    const avatarMap = new Map<string, string | null>()
    for (const row of usersRows) {
      if (typeof row.id !== 'string') continue
      avatarMap.set(row.id, typeof row.avatar_url === 'string' ? row.avatar_url : null)
    }

    for (const row of memberList) {
      if (typeof row.game_id !== 'string' || typeof row.user_id !== 'string') continue
      const member: GameMemberProfile = {
        user_id: row.user_id,
        role: typeof row.role === 'string' ? row.role : 'player',
        username: userMap.get(row.user_id) ?? null,
        avatar_url: avatarMap.get(row.user_id) ?? null,
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

  for (const row of memberList) {
    if (typeof row.game_id !== 'string' || typeof row.user_id !== 'string') continue
    const member: GameMemberProfile = {
      user_id: row.user_id,
      role: typeof row.role === 'string' ? row.role : 'player',
      username: userMap.get(row.user_id) ?? null,
      avatar_url: null,
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

  const createGameRpcName = 'create_chess_game'
  if (!missingRpcCache.has(createGameRpcName)) {
    const { data: rpcGame, error: rpcError } = await supabase.rpc(createGameRpcName, rpcPayload)

    if (!rpcError && rpcGame) {
      notifyGamesChanged()
      return rpcGame as GameRow
    }

    if (!isRpcNotFoundError(rpcError)) throw rpcError
    missingRpcCache.add(createGameRpcName)
  }

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
    .select('id, username, avatar_url')
    .in('id', uniqueIds)

  if (usersError) throw usersError

  const userMap = new Map<string, string | null>()
  const avatarMap = new Map<string, string | null>()
  for (const row of (users ?? []) as Array<{ id?: unknown; username?: unknown; avatar_url?: unknown }>) {
    if (typeof row.id !== 'string') continue
    userMap.set(row.id, typeof row.username === 'string' ? row.username : null)
    avatarMap.set(row.id, typeof row.avatar_url === 'string' ? row.avatar_url : null)
  }

  return memberRows
    .filter((row): row is { user_id: string; role: string } => typeof row.user_id === 'string' && typeof row.role === 'string')
    .map((row) => ({
      user_id: row.user_id,
      role: row.role,
      username: userMap.get(row.user_id) ?? null,
      avatar_url: avatarMap.get(row.user_id) ?? null,
    }))
}

export async function makeMove(gameId: string, ply: number, uci: string, fenAfter: string, hintUsed = false) {
  const userId = await requireAuthedUserId()
  const movesTable = supabase.from('chess_moves')
  const baseRow = { game_id: gameId, ply, uci, fen_after: fenAfter, created_by: userId }
  const rowWithHint = { ...baseRow, hint_used: hintUsed }

  const firstAttempt = await movesTable.insert(rowWithHint).select('*').single()
  if (!firstAttempt.error) {
    // Log game_played activity on successful move (fire-and-forget)
    logActivity('game_played', { gameId, ply })
    return firstAttempt.data
  }

  if (!isMissingColumnError(firstAttempt.error, 'hint_used')) {
    throw firstAttempt.error
  }

  const fallbackAttempt = await movesTable.insert(baseRow).select('*').single()
  if (fallbackAttempt.error) throw fallbackAttempt.error
  // Log game_played activity on fallback successful move (fire-and-forget)
  logActivity('game_played', { gameId, ply })
  return fallbackAttempt.data
}

export async function restartGame(gameId: string) {
  await requireAuthedUserId()
  const restartGameRpcName = 'restart_game'
  if (!missingRpcCache.has(restartGameRpcName)) {
    const { error } = await supabase.rpc(restartGameRpcName, { p_game_id: gameId })
    if (!error) {
      notifyGamesChanged()
      return
    }
    if (!isRpcNotFoundError(error)) throw error
    missingRpcCache.add(restartGameRpcName)
  }

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
