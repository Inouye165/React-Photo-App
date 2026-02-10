import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { fetchGame, fetchMoves, makeMove } from '../api/games'
import { supabase } from '../supabaseClient'
import { useGameRealtime } from '../hooks/useGameRealtime'

export default function ChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  const { moves } = useGameRealtime(gameId || null)
  const [boardFen, setBoardFen] = useState<string>('')

  useEffect(() => {
    async function load() {
      if (!gameId) return
      const g = await fetchGame(gameId)
      const m = await fetchMoves(gameId)
      // build chess from moves
      const c = new Chess(g.current_fen || undefined)
      for (const mv of m) {
        try { c.move({ from: mv.uci.slice(0,2), to: mv.uci.slice(2,4), promotion: mv.uci.slice(4) || undefined }) } catch { }
      }
      setBoardFen(c.fen())
    }
    void load()
  }, [gameId])

  useEffect(() => {
    // apply realtime moves
    if (!moves || moves.length === 0) return
    const last = moves[moves.length - 1]
    if (last && last.fen_after) setBoardFen(last.fen_after)
  }, [moves])

  async function onDrop(sourceSquare: string, targetSquare: string) {
    if (!gameId) return false
    const c = new Chess(boardFen || undefined)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    if (!move) return false
    const fenAfter = c.fen()
    try {
      // compute next ply
      const ply = (moves?.length ?? 0) + 1
      await makeMove(gameId, ply, `${move.from}${move.to}${move.promotion ?? ''}`, fenAfter)
      // update games.current_fen and current_turn
      const nextTurn = fenAfter.split(' ')[1] === 'w' ? 'w' : 'b'
      await supabase.from('games').update({ current_fen: fenAfter, current_turn: nextTurn, updated_at: new Date().toISOString() }).eq('id', gameId)
      setBoardFen(fenAfter)
      return true
    } catch (err) {
      return false
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Chess</h2>
      <div className="flex gap-6">
        <div>
          <Chessboard position={boardFen} onPieceDrop={(src, dst) => { void onDrop(src, dst); return true }} />
        </div>
        <div>
          <div>Game: {gameId}</div>
          <div>Players:</div>
          <div>Moves: {(moves || []).length}</div>
        </div>
      </div>
    </div>
  )
}
