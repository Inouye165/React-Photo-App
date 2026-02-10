import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyGames, createChessGame } from '../api/games'
import { searchUsers } from '../api/chat'

export default function GamesIndex(): React.JSX.Element {
  const [games, setGames] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      try {
        const g = await listMyGames()
        setGames(g)
      } catch (err) {
        // ignore for MVP
      }
    }
    load()
  }, [])

  async function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    if (!v.trim()) return setResults([])
    const res = await searchUsers(v)
    setResults(res)
  }

  async function handleCreate(opponentId?: string) {
    const game = await createChessGame(opponentId || null, null)
    navigate(`/games/${game.id}`)
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Games</h2>
      <div className="mb-4">
        <button onClick={() => handleCreate()} className="px-3 py-1 bg-slate-700 text-white rounded">New Game (Random Opponent)</button>
      </div>

      <div className="mb-4">
        <label className="block text-xs text-slate-600">Invite by username</label>
        <input value={query} onChange={handleSearch} className="border p-2 rounded w-64" placeholder="Search users" />
        <div>
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span>{r.username || r.id}</span>
              <button onClick={() => handleCreate(r.id)} className="px-2 py-1 bg-indigo-600 text-white rounded text-sm">Invite</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Your Games</h3>
        <ul>
          {games.map((g) => (
            <li key={g.id} className="py-2 border-b">
              <button onClick={() => navigate(`/games/${g.id}`)} className="text-left w-full">
                <div className="flex justify-between">
                  <div>{g.type} — {g.status}</div>
                  <div className="text-xs text-slate-500">{new Date(g.updated_at).toLocaleString()}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
